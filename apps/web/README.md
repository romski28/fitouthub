This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Professionals Invite Modal

- Title: The invite modal now includes a visible "Project Title" field. It defaults to "{trade} in {location}" when filters are set, falling back to sensible generic titles.
- Field Order: Title, Project Location, Description, Required Trades/Services, Photos.
- Pre-population: Trade is inferred from the professionals search input; location is taken from the location filter. Both are passed into the modal and can be edited.
- Notes: Photos added in the quick share flow are appended to the created project's notes with absolute URLs.

### Quick Test

1. Open the Professionals page.
2. Set a trade (e.g., "Plumber") and a location (e.g., "Central").
3. Select 1–3 professionals and click "Ask for help".
4. Verify the modal shows the default title and pre-filled trade/location.
5. Submit to create the project and send invites.
