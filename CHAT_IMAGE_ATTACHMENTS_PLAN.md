# Chat Image Attachments - Implementation Plan

## Overview
Add image attachment functionality to all chat interfaces using the existing Cloudflare R2 infrastructure. This will enable users to share images for payment requests, fault reporting, progress updates, and general communication.

## Requirements
1. **Reuse existing infrastructure**: Use the working `/uploads` endpoint and R2 configuration
2. **Reusable components**: Single chat component approach across all three chat types
3. **Storage**: Store images in Cloudflare R2 (same as professional profile images)
4. **Chat types to support**:
   - ProjectChat (multi-party: client, professional, admin)
   - PrivateChatThread (client ↔ professional)
   - PrivateChatThread (FOH support ↔ user/professional)

## Current Architecture

### Existing Upload Infrastructure ✅
- **API Endpoint**: `POST /uploads` in `apps/api/src/uploads/uploads.controller.ts`
- **Configuration**: Cloudflare R2 via S3Client (`@aws-sdk/client-s3`)
- **Environment Variables**:
  - `STORAGE_ENDPOINT`: R2 endpoint
  - `STORAGE_BUCKET`: bucket name
  - `STORAGE_ACCESS_KEY_ID`: R2 access key
  - `STORAGE_SECRET_ACCESS_KEY`: R2 secret key
  - `PUBLIC_ASSETS_BASE_URL`: CDN URL for public access
- **Features**:
  - Accepts multiple files (max 10)
  - Image validation (mimetype)
  - 10MB per file limit
  - Returns array of public URLs
  - DELETE endpoint for cleanup

### Existing Chat Components
1. **ProjectChat** (`apps/web/src/components/project-chat.tsx`)
   - Used in project detail pages
   - Multi-party communication
   - Currently text-only

2. **FloatingChat** (`apps/web/src/components/floating-chat.tsx`)
   - FOH support chat bubble
   - Private threads for logged-in users
   - Currently text-only

### Database Models
**ProjectChatMessage**:
```prisma
model ProjectChatMessage {
  id              String   @id @default(cuid())
  threadId        String
  senderType      String   // 'client' | 'professional' | 'foh'
  senderUserId    String?
  senderProId     String?
  content         String
  createdAt       DateTime @default(now())
  readByClientAt  DateTime?
  readByProAt     DateTime?
  readByFohAt     DateTime?
  thread          ProjectChatThread @relation(fields: [threadId], references: [id], onDelete: Cascade)
}
```

**PrivateChatMessage**:
```prisma
model PrivateChatMessage {
  id              String   @id @default(cuid())
  threadId        String
  senderType      String   // 'user' | 'professional' | 'foh'
  senderUserId    String?
  senderProId     String?
  content         String
  createdAt       DateTime @default(now())
  readByFohAt     DateTime?
  readByUserAt    DateTime?
  readByProAt     DateTime?
  thread          PrivateChatThread @relation(fields: [threadId], references: [id], onDelete: Cascade)
}
```

## Implementation Plan

### Phase 1: Database Schema Updates

#### 1.1 Add attachments field to message models
Add a `attachments` JSON field to store array of image URLs:

```prisma
model ProjectChatMessage {
  // ...existing fields
  attachments     Json?    @default("[]")  // Array of { url: string, filename: string }
}

model PrivateChatMessage {
  // ...existing fields
  attachments     Json?    @default("[]")  // Array of { url: string, filename: string }
}

model AnonymousChatMessage {
  // ...existing fields
  attachments     Json?    @default("[]")  // Array of { url: string, filename: string }
}
```

**Action Items**:
- [ ] Update `apps/api/prisma/schema.prisma`
- [ ] Generate migration: `pnpm --filter api exec prisma migrate dev --name add_chat_attachments`
- [ ] Apply migration to production

**Why JSON?**:
- Simple array storage without additional tables
- No time-limited URLs needed (projects have varying timelines)
- Easy to query and update
- Matches existing patterns in the codebase

---

### Phase 2: Backend API Updates

#### 2.1 Update message creation endpoints
Modify existing chat message endpoints to accept attachments:

**Files to update**:
- `apps/api/src/projects/projects.controller.ts` (ProjectChat endpoint)
- `apps/api/src/chat/chat.controller.ts` (PrivateChat endpoint)

**Changes**:
```typescript
// In POST /projects/:id/chat/messages
// In POST /chat/private/messages

interface CreateMessageDto {
  content: string;
  attachments?: { url: string; filename: string }[];
}

// Example implementation:
@Post(':id/chat/messages')
async sendProjectChatMessage(
  @Param('id') projectId: string,
  @Body() dto: { content: string; attachments?: any[] },
  @Request() req: any,
) {
  // Validation
  if (!dto.content?.trim() && (!dto.attachments || dto.attachments.length === 0)) {
    throw new BadRequestException('Message must have content or attachments');
  }

  // Create message with attachments
  const message = await this.prisma.projectChatMessage.create({
    data: {
      threadId: thread.id,
      content: dto.content || '',
      attachments: dto.attachments || [],
      // ...other fields
    },
  });

  return { message };
}
```

**Action Items**:
- [ ] Update ProjectChat message endpoint to accept `attachments` array
- [ ] Update PrivateChat message endpoint to accept `attachments` array
- [ ] Add validation: require either content OR attachments (not both empty)
- [ ] Test endpoints with Postman/Thunder Client

**Note**: No new upload endpoint needed - reuse existing `/uploads` endpoint!

---

### Phase 3: Frontend Components

#### 3.1 Create ChatImageAttachment component
Reusable component for displaying image attachments in messages.

**File**: `apps/web/src/components/chat-image-attachment.tsx`

```tsx
'use client';

interface ChatImageAttachmentProps {
  url: string;
  filename: string;
  className?: string;
}

export default function ChatImageAttachment({ url, filename, className = '' }: ChatImageAttachmentProps) {
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  return (
    <>
      <div className={`relative group cursor-pointer ${className}`} onClick={() => setIsLightboxOpen(true)}>
        <img
          src={url}
          alt={filename}
          className="max-w-[200px] rounded-lg border border-slate-200 hover:opacity-90 transition"
        />
        <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition">
          Click to enlarge
        </div>
      </div>

      {/* Lightbox overlay */}
      {isLightboxOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setIsLightboxOpen(false)}
        >
          <div className="relative max-w-4xl max-h-full">
            <img src={url} alt={filename} className="max-w-full max-h-[90vh] rounded-lg" />
            <button
              className="absolute top-2 right-2 bg-white text-slate-900 px-3 py-1 rounded-lg text-sm hover:bg-slate-100"
              onClick={() => setIsLightboxOpen(false)}
            >
              Close
            </button>
            <div className="absolute bottom-2 left-2 bg-black/60 text-white text-sm px-3 py-1 rounded">
              {filename}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

**Action Items**:
- [ ] Create `apps/web/src/components/chat-image-attachment.tsx`
- [ ] Add lightbox functionality
- [ ] Add loading state for images
- [ ] Add error handling for broken images

---

#### 3.2 Create ChatImageUploader component
Specialized image uploader for chat input areas.

**File**: `apps/web/src/components/chat-image-uploader.tsx`

```tsx
'use client';

import { useState } from 'react';
import { API_BASE_URL } from '@/config/api';

interface ChatImageUploaderProps {
  onImagesUploaded: (images: { url: string; filename: string }[]) => void;
  maxImages?: number;
  disabled?: boolean;
}

export default function ChatImageUploader({
  onImagesUploaded,
  maxImages = 3,
  disabled = false,
}: ChatImageUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewFiles, setPreviewFiles] = useState<File[]>([]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    if (files.length > maxImages) {
      setError(`Maximum ${maxImages} images allowed`);
      return;
    }

    setError(null);
    setPreviewFiles(files);
  };

  const handleUpload = async () => {
    if (previewFiles.length === 0) return;

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      previewFiles.forEach((file) => formData.append('files', file));

      const res = await fetch(`${API_BASE_URL.replace(/\/$/, '')}/uploads`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) throw new Error('Upload failed');

      const data = await res.json();
      const images = data.urls.map((url: string, i: number) => ({
        url,
        filename: previewFiles[i].name,
      }));

      onImagesUploaded(images);
      setPreviewFiles([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const removePreview = (index: number) => {
    setPreviewFiles((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      {/* File input */}
      <label className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer text-sm transition">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        Add images
        <input
          type="file"
          multiple
          accept="image/*"
          onChange={handleFileSelect}
          disabled={disabled || uploading}
          className="hidden"
        />
      </label>

      {/* Preview images */}
      {previewFiles.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {previewFiles.map((file, i) => (
            <div key={i} className="relative">
              <img
                src={URL.createObjectURL(file)}
                alt={file.name}
                className="w-16 h-16 object-cover rounded border border-slate-200"
              />
              <button
                onClick={() => removePreview(i)}
                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 text-xs hover:bg-red-600"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Upload button */}
      {previewFiles.length > 0 && (
        <button
          onClick={handleUpload}
          disabled={uploading}
          className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:bg-slate-300"
        >
          {uploading ? 'Uploading...' : `Upload ${previewFiles.length} image${previewFiles.length > 1 ? 's' : ''}`}
        </button>
      )}

      {/* Error message */}
      {error && (
        <div className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded border border-red-200">
          {error}
        </div>
      )}
    </div>
  );
}
```

**Action Items**:
- [ ] Create `apps/web/src/components/chat-image-uploader.tsx`
- [ ] Add preview functionality
- [ ] Add validation (file size, image types)
- [ ] Add upload progress indicator

---

#### 3.3 Update ProjectChat component
Integrate image attachments into the main project chat component.

**File**: `apps/web/src/components/project-chat.tsx`

**Changes**:
1. Import new components
2. Update ChatMessage interface
3. Add state for pending attachments
4. Integrate ChatImageUploader in input area
5. Display attachments in message bubbles

```tsx
import ChatImageAttachment from './chat-image-attachment';
import ChatImageUploader from './chat-image-uploader';

interface ChatMessage {
  id: string;
  senderType: 'client' | 'professional' | 'foh';
  senderName?: string;
  content: string;
  attachments?: { url: string; filename: string }[];
  createdAt: string;
}

export default function ProjectChat({ projectId, accessToken, currentUserRole, className = '' }: ProjectChatProps) {
  // ...existing state
  const [pendingAttachments, setPendingAttachments] = useState<{ url: string; filename: string }[]>([]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!newMessage.trim() && pendingAttachments.length === 0) || sending) return;

    setSending(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE_URL}/projects/${projectId}/chat/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: newMessage.trim(),
          attachments: pendingAttachments,
        }),
      });

      if (!res.ok) throw new Error('Failed to send message');

      const data = await res.json();
      setMessages((prev) => [...prev, data.message]);
      setNewMessage('');
      setPendingAttachments([]);
    } catch (err) {
      console.error('Error sending message:', err);
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  // In message rendering:
  {messages.map((msg) => (
    <div key={msg.id} className={`flex ${isCurrent ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[75%] rounded-lg px-4 py-2 text-sm ${/* styling */}`}>
        {/* Sender name */}
        {!isCurrent && (
          <div className="text-xs font-semibold mb-1">{getSenderLabel(msg)}</div>
        )}
        
        {/* Message content */}
        {msg.content && (
          <div className="whitespace-pre-wrap">{msg.content}</div>
        )}
        
        {/* Image attachments */}
        {msg.attachments && msg.attachments.length > 0 && (
          <div className="mt-2 space-y-2">
            {msg.attachments.map((att, i) => (
              <ChatImageAttachment key={i} url={att.url} filename={att.filename} />
            ))}
          </div>
        )}
        
        {/* Timestamp */}
        <div className="text-xs mt-1">{/* timestamp */}</div>
      </div>
    </div>
  ))}

  // In input area:
  <form onSubmit={handleSend} className="border-t border-slate-200 p-4">
    {/* Error display */}
    
    {/* Image uploader */}
    <div className="mb-2">
      <ChatImageUploader
        onImagesUploaded={(images) => setPendingAttachments((prev) => [...prev, ...images])}
        maxImages={3}
        disabled={sending}
      />
    </div>

    {/* Show pending attachments */}
    {pendingAttachments.length > 0 && (
      <div className="mb-2 flex flex-wrap gap-2">
        {pendingAttachments.map((att, i) => (
          <div key={i} className="relative">
            <img src={att.url} alt={att.filename} className="w-12 h-12 object-cover rounded border" />
            <button
              onClick={() => setPendingAttachments((prev) => prev.filter((_, idx) => idx !== i))}
              className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 text-xs"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    )}
    
    {/* Text input and send button */}
    <div className="flex gap-2">
      <input type="text" /* ... */ />
      <button type="submit" /* ... */ />
    </div>
  </form>
}
```

**Action Items**:
- [ ] Update ChatMessage interface with attachments field
- [ ] Add pendingAttachments state
- [ ] Integrate ChatImageUploader in input area
- [ ] Update handleSend to include attachments
- [ ] Display attachments in message bubbles
- [ ] Add remove functionality for pending attachments

---

#### 3.4 Update FloatingChat component
Apply same changes to FOH support chat.

**File**: `apps/web/src/components/floating-chat.tsx`

**Changes**: Same as ProjectChat component (see section 3.3)

**Action Items**:
- [ ] Update ChatMessage interface with attachments field
- [ ] Add pendingAttachments state
- [ ] Integrate ChatImageUploader
- [ ] Update message sending logic
- [ ] Display attachments in messages

---

### Phase 4: Testing & Validation

#### 4.1 Backend Testing
- [ ] Test ProjectChat message endpoint with attachments
- [ ] Test PrivateChat message endpoint with attachments
- [ ] Test validation (empty message with no attachments should fail)
- [ ] Test message retrieval includes attachments
- [ ] Verify attachments are stored as JSON array

#### 4.2 Frontend Testing
- [ ] Test image upload in ProjectChat
- [ ] Test image upload in FloatingChat
- [ ] Test lightbox functionality
- [ ] Test sending text + images
- [ ] Test sending images only
- [ ] Test removing pending attachments
- [ ] Test image preview
- [ ] Test mobile responsiveness

#### 4.3 Integration Testing
- [ ] Test across all three user types (client, professional, admin)
- [ ] Test image visibility for all participants
- [ ] Test Cloudflare R2 URLs are accessible
- [ ] Test image loading performance
- [ ] Test with slow connections
- [ ] Test file size limits

---

### Phase 5: Documentation & Deployment

#### 5.1 Documentation
- [ ] Update API documentation with new attachment field
- [ ] Document image size limits
- [ ] Document supported image formats
- [ ] Add user guide for image attachments

#### 5.2 Deployment
- [ ] Run Prisma migrations on production database
- [ ] Deploy backend changes
- [ ] Deploy frontend changes
- [ ] Verify R2 storage configuration
- [ ] Monitor error logs
- [ ] Test in production

---

## Technical Notes

### Why This Approach?

1. **Reuses existing infrastructure**: No new S3 setup, no new upload endpoints
2. **Simple JSON storage**: No additional tables needed for attachments
3. **Consistent UX**: Same upload experience across all chat types
4. **Scalable**: JSON arrays handle 1-10 images per message easily
5. **No expiring URLs**: Images accessible as long as project exists

### Image Storage Pattern

Following the professional profile pattern from [apps/web/src/app/professional/profile/page.tsx:80](apps/web/src/app/professional/profile/page.tsx#L80):

```typescript
const uploadFiles = async (files: File[]) => {
  const formData = new FormData();
  files.forEach((f) => formData.append('files', f));
  const res = await fetch(`${API_BASE_URL}/uploads`, {
    method: 'POST',
    body: formData,
  });
  const data = await res.json();
  return data.urls; // Returns array of public URLs
};
```

### Limitations & Considerations

1. **Max images per message**: Recommend 3-5 images (configurable)
2. **File size**: 10MB per image (existing upload limit)
3. **Supported formats**: Images only (JPEG, PNG, GIF, WebP)
4. **No video/documents**: Image-only for initial release
5. **No image editing**: Upload as-is (can add cropping later)
6. **No compression**: Client-side compression could be added later

### Future Enhancements

1. **Client-side image compression** before upload
2. **Drag-and-drop** file upload
3. **Copy-paste** images from clipboard
4. **Image captions** (add caption field to attachment object)
5. **Video support** (requires different storage approach)
6. **Document attachments** (PDF, DOC)
7. **Thumbnail generation** (server-side)
8. **Image gallery view** (view all project images)

---

## Estimated Implementation Time

| Phase | Task | Time Estimate |
|-------|------|---------------|
| 1 | Database schema updates | 30 min |
| 2 | Backend API updates | 1-2 hours |
| 3.1 | ChatImageAttachment component | 1 hour |
| 3.2 | ChatImageUploader component | 1-2 hours |
| 3.3 | Update ProjectChat | 1-2 hours |
| 3.4 | Update FloatingChat | 1 hour |
| 4 | Testing & validation | 2-3 hours |
| 5 | Documentation & deployment | 1 hour |
| **Total** | | **8-12 hours** |

---

## Success Criteria

✅ Users can upload images in ProjectChat  
✅ Users can upload images in FOH support chat  
✅ Images display as thumbnails in messages  
✅ Clicking images opens lightbox view  
✅ Images stored in Cloudflare R2  
✅ No new upload endpoints needed  
✅ Mobile-responsive design  
✅ Works for all user types (client, professional, admin)  
✅ Error handling for failed uploads  
✅ Loading states during upload  

---

## Questions for Review

1. **Max images per message**: Is 3 images reasonable? Should it be configurable per chat type?
2. **Image captions**: Should users be able to add captions to images?
3. **Image compression**: Should we compress images client-side before upload?
4. **Gallery view**: Should there be a "view all project images" feature?
5. **Notifications**: Should image attachments trigger different notifications than text?

---

## Next Steps

Once this plan is approved:
1. Start with Phase 1 (database schema)
2. Test migrations on development database
3. Implement backend changes (Phase 2)
4. Create reusable frontend components (Phase 3)
5. Progressive testing throughout
6. Deploy to production

