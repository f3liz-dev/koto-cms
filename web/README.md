# Web Frontend Architecture

This directory contains the refactored frontend application built with Preact and Vite.

## Structure

```
web/
├── components/          # UI components
│   ├── AppTopbar.jsx   # Main application header
│   ├── FileEditor.jsx  # File editing interface
│   ├── LoginScreen.jsx # Authentication screen
│   ├── PreviewPane.jsx # Markdown/Vue preview
│   ├── PreviewTabOverlay.jsx # Full-screen preview modal
│   ├── Sidebar.jsx     # File tree navigation
│   └── Toast.jsx       # Toast notifications
├── hooks/              # Custom React hooks for state management
│   ├── useAuth.js      # Authentication state
│   ├── useBranches.js  # Branch management
│   ├── useFileEditor.js # File editing state
│   ├── useFileTree.js  # File tree navigation
│   ├── useKeyboardShortcuts.js # Keyboard shortcuts
│   └── useToast.js     # Toast notifications
├── preview/            # Preview rendering system
│   ├── mock-vitepress.js # VitePress API mock
│   ├── preview.frame.inc.html # Preview iframe template
│   ├── preview.runtime.inc.js # Preview iframe runtime
│   ├── rehypeSyncIndex.js # Sync index plugin
│   └── renderVitepressPreview.js # Preview renderer
├── styles/             # CSS styles
│   └── app.css         # Main stylesheet
├── utils/              # Utility functions
│   └── fileTypes.js    # File type detection
├── api.js              # API client
├── App.jsx             # Main application component
├── main.jsx            # Application entry point
├── MarkdownEditor.jsx  # Markdown editor component
└── syncIndexPlugin.js  # Editor sync plugin
```

## Key Concepts

### Component Architecture

The application follows a component-based architecture with clear separation of concerns:

- **Presentational Components**: Pure UI components that receive props and render UI
- **Container Components**: Components that manage state and business logic
- **Custom Hooks**: Reusable state management logic extracted from components

### State Management

State is managed using custom hooks that encapsulate related logic:

- `useAuth`: User authentication and session management
- `useBranches`: Git branch operations
- `useFileTree`: File system navigation
- `useFileEditor`: File editing operations
- `useToast`: Toast notification system
- `useKeyboardShortcuts`: Global keyboard shortcuts

### Preview System

The preview system renders Markdown and Vue files in an isolated iframe:

1. Content is parsed and rendered using markdown-it and custom plugins
2. HTML is sanitized using DOMPurify for security
3. Sync indices are stamped on blocks for scroll synchronization
4. The iframe runs in a sandboxed environment with no same-origin access

### Editor Sync

The editor and preview panes are synchronized:

- Editor blocks are decorated with `data-sync-index` attributes
- Preview blocks receive matching indices during rendering
- Scroll events in the editor trigger preview scroll updates
- The system maintains block-level granularity for smooth scrolling

## Development

### Running the Dev Server

```bash
npm run dev
```

The dev server runs on port 5173 and proxies API requests to the backend on port 3000.

### Building for Production

```bash
npm run build
```

Builds are output to the `public/` directory.

## Best Practices

1. **Component Size**: Keep components focused and under 200 lines
2. **Hook Extraction**: Extract complex state logic into custom hooks
3. **Props**: Use destructuring for clarity and avoid prop drilling
4. **Naming**: Use descriptive names that indicate purpose
5. **Comments**: Add comments for complex logic, not obvious code
6. **Security**: Always sanitize user-generated content before rendering
