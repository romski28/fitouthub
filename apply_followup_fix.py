#!/usr/bin/env python3
"""Fix follow-up questions filtering in AI wizard handoff"""

import re

# Fix 1: search-flow.tsx - filter empty strings when storing followUpQuestions
search_flow_path = r"apps/web/src/components/search-flow.tsx"
with open(search_flow_path, 'r', encoding='utf-8') as f:
    search_flow_content = f.read()

old_payload = """    const projectDescriptionPayload = {
      title: aiDraft.initialData.projectName || '',
      description: aiDraft.initialData.notes || '',
      projectScale: aiDraft.initialData.projectScale,
      isEmergency: Boolean(aiDraft.initialData.isEmergency),
      profession: aiDraft.initialData.tradesRequired?.[0],
      location: aiDraft.initialData.location,
      tradesRequired: aiDraft.initialData.tradesRequired || [],
      followUpQuestions: aiStructured.nextQuestions || [],
    };"""

new_payload = """    const projectDescriptionPayload = {
      title: aiDraft.initialData.projectName || '',
      description: aiDraft.initialData.notes || '',
      projectScale: aiDraft.initialData.projectScale,
      isEmergency: Boolean(aiDraft.initialData.isEmergency),
      profession: aiDraft.initialData.tradesRequired?.[0],
      location: aiDraft.initialData.location,
      tradesRequired: aiDraft.initialData.tradesRequired || [],
      followUpQuestions: (aiStructured.nextQuestions || []).filter((q: string) => typeof q === 'string' && q.trim().length > 0),
    };"""

search_flow_content = search_flow_content.replace(old_payload, new_payload)

with open(search_flow_path, 'w', encoding='utf-8') as f:
    f.write(search_flow_content)

print("✓ Fixed search-flow.tsx - now filters empty strings from followUpQuestions")

# Fix 2: create-project/page.tsx - filter empty strings when reading followUpQuestions
create_project_path = r"apps/web/src/app/create-project/page.tsx"
with open(create_project_path, 'r', encoding='utf-8') as f:
    create_project_content = f.read()

old_seed = "        const seedFollowUpQuestions = parsedDescriptionForDebug?.followUpQuestions || [];"
new_seed = "        const seedFollowUpQuestions = (parsedDescriptionForDebug?.followUpQuestions || []).filter((q: string) => typeof q === 'string' && q.trim().length > 0);"

create_project_content = create_project_content.replace(old_seed, new_seed)

with open(create_project_path, 'w', encoding='utf-8') as f:
    f.write(create_project_content)

print("✓ Fixed create-project/page.tsx - now filters empty strings from seedFollowUpQuestions")
print("\nBoth fixes applied successfully!")
