# Frontend Refactoring Migration Guide

## Overview

The frontend has been refactored from a single 600+ line `App.jsx` file into a modular, maintainable architecture with:

- 7 custom hooks for state management
- 7 focused UI components
- Utility modules for common functions
- Clear separation of concerns

## What Changed

### Before
```
web/
├── App.jsx (600+ lines - everything in one file)
├── MarkdownEditor.jsx
├── api.js
└── components/
    └── PreviewPane.jsx
```

### After
```
web/
├── App.jsx (clean, orchestrates components)
├── components/ (7 focused components)
├── hooks/ (6 custom hooks)
├── utils/ (shared utilities)
├── preview/ (preview system)
└── styles/
```

## Key Improvements

### 1. State Management Extracted to Hooks

**Before**: All state in one massive component
```jsx
const [user, setUser] = useState(null);
const [branches, setBranches] = useState([]);
const [files, setFiles] = useState([]);
// ... 20+ more state variables
```

**After**: Focused, reusable hooks
```jsx
const { user, repo, loading, isAuthenticated, logout } = useAuth();
const { branches, selectedBranch, loadBranches, createBranch } = useBranches();
const { files, loadTree, navigateUp } = useFileTree();
const fileEditor = useFileEditor();
```

### 2. UI Components Separated

**Before**: 600 lines of JSX mixed with logic

**After**: Each component has a single responsibility
- `AppTopbar`: Navigation and actions
- `Sidebar`: File tree and user info
- `FileEditor`: File editing interface
- `LoginScreen`: Authentication
- `Toast`: Notifications
- `PreviewTabOverlay`: Full-screen preview

### 3. Business Logic Centralized

File operations, branch management, and authentication logic are now in dedicated hooks, making them:
- Testable in isolation
- Reusable across components
- Easier to maintain and debug

### 4. Better Type Safety

Utility functions like `isMarkdownPath()` and `isVuePath()` are now in a dedicated module, reducing duplication and errors.

## Breaking Changes

None! The refactored code maintains the same API and behavior. All existing functionality works identically.

## Testing the Refactor

1. Start the dev server: `npm run dev`
2. Test authentication flow
3. Test branch creation and selection
4. Test file opening, editing, and saving
5. Test preview synchronization
6. Test focus mode
7. Test keyboard shortcuts (Cmd/Ctrl+S, Escape)

## Benefits

### For Developers
- Easier to understand and modify
- Clear file organization
- Reusable hooks and components
- Better IDE support and autocomplete

### For Maintenance
- Bugs are easier to isolate
- Changes are less likely to cause regressions
- New features can be added without touching unrelated code

### For Performance
- Components can be memoized individually
- Hooks enable better optimization opportunities
- Smaller bundle chunks possible with code splitting

## Next Steps

Consider these future improvements:

1. **Add TypeScript**: Type safety would catch errors earlier
2. **Add Tests**: Unit tests for hooks, integration tests for components
3. **Add Storybook**: Visual component documentation
4. **Add Error Boundaries**: Better error handling and recovery
5. **Add Loading States**: Skeleton screens for better UX
6. **Add Optimistic Updates**: Instant UI feedback before API responses
