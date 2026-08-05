// Prototype-only overlay. It is intentionally isolated from the Zoid Bank UI.
const root = document.getElementById('agentation-root');

if (import.meta.env.DEV && root) {
  const [{ createRoot }, { default: React }, { Agentation }] = await Promise.all([
    import('react-dom/client'),
    import('react'),
    import('agentation'),
  ]);

  createRoot(root).render(React.createElement(Agentation));
}
