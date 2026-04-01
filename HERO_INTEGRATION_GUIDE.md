# Hero Integration Guide (React + shadcn + Tailwind + TypeScript)

This repository is currently a Python desktop app and does not contain a React build setup yet. The hero component files are prepared, but to run them you need a frontend app scaffold.

## Files added for the hero

- `components/ui/background-paths.tsx`
- `components/ui/demo.tsx`
- `components/ui/button.tsx`
- `lib/utils.ts`

## Required dependencies

Install these in your React frontend project:

```bash
npm install framer-motion @radix-ui/react-slot class-variance-authority clsx tailwind-merge
```

Optional icon package if needed:

```bash
npm install lucide-react
```

## If your codebase does not support shadcn + Tailwind + TypeScript

Create a Next.js TypeScript app with Tailwind:

```bash
npx create-next-app@latest web --typescript --tailwind --eslint --src-dir --app --import-alias "@/*"
cd web
npx shadcn@latest init
```

After this, copy the prepared files from this repo into:

- `web/components/ui/background-paths.tsx`
- `web/components/ui/demo.tsx`
- `web/components/ui/button.tsx`
- `web/lib/utils.ts`

## Default paths to use

- Components: `components/ui`
- Global styles: `app/globals.css` (or `src/app/globals.css` if using src dir)

If your current default component path is not `components/ui`, create it.

Why this matters:

- shadcn examples and generators assume `components/ui`
- imports stay consistent as `@/components/ui/...`
- reusable primitives remain centralized

## Mount the hero section

Use this in your main page component (for example `app/page.tsx`):

```tsx
import { DemoBackgroundPaths } from "@/components/ui/demo";

export default function Page() {
  return <DemoBackgroundPaths />;
}
```

## Component analysis (from your implementation checklist)

1. Component structure and dependencies
- Uses `framer-motion` for animated paths and letter entrance
- Uses shadcn `Button` primitive
- Uses utility `cn` via `lib/utils.ts`

2. Arguments and state
- Public prop: `title?: string`
- Internal state: none

3. Required providers/hooks
- No context provider required
- No custom hooks required

4. Integration questions and answers
- What props are passed? `title` string for hero heading
- State management requirements? None
- Required assets? None for this hero
- Responsive behavior? Tailwind `sm` and `md` breakpoints already included
- Best place to use it? Top hero section of landing page route

## Notes on your existing static landing page

Your current `index.html` landing page remains valid for static hosting.
The React hero is for your frontend app track and should be mounted in that app's route/page.
