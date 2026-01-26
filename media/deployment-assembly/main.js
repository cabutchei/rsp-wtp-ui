(function () {
  const e = React.createElement;
  const vscode = acquireVsCodeApi();

  function Header(props) {
    return e(
      'div',
      { className: 'header' },
      e('div', { className: 'header__title' }, props.title),
      e('div', { className: 'header__subtitle' }, props.subtitle),
    );
  }

  function Pill(props) {
    return e('span', { className: 'pill' }, props.children);
  }

  function Icon(props) {
    const kind = props.kind || 'project';
    return e('span', { className: 'icon icon--' + kind, 'aria-hidden': true });
  }

  function EmptyState() {
    return e(
      'div',
      { className: 'empty-state' },
      e('div', { className: 'empty-state__title' }, 'No deployment assembly entries'),
      e('div', { className: 'empty-state__subtitle' }, 'Select a project with a deployment assembly to view mappings.'),
    );
  }

  function CellContent(props) {
    return e(
      'div',
      { className: 'cell-content' },
      e(Icon, { kind: props.kind }),
      e('span', { className: 'cell-text' }, props.text),
    );
  }

  function AddMenu(props) {
    const [open, setOpen] = React.useState(false);
    const toggle = () => setOpen(!open);
    const select = (value) => {
      setOpen(false);
      props.onSelect(value);
    };

    return e(
      'div',
      { className: 'menu' },
      e(
        'button',
        { className: 'btn', onClick: toggle, type: 'button' },
        'Add entry'
      ),
      open && e(
        'div',
        { className: 'menu__list' },
        e('button', { className: 'menu__item', type: 'button', onClick: () => select('fileSystem') }, 'Archives from File System'),
        e('button', { className: 'menu__item', type: 'button', onClick: () => select('workspaceArchives') }, 'Archives from Workspace'),
        e('button', { className: 'menu__item', type: 'button', onClick: () => select('project') }, 'Project')
      )
    );
  }

  function AssemblyTable(props) {
    if (!props.rows.length) {
      return e(EmptyState);
    }
    return e(
      'table',
      { className: 'assembly-table' },
      e(
        'thead',
        null,
        e('tr', null, e('th', null, 'Source'), e('th', null, 'Deploy Path'), e('th', { className: 'cell-actions' }, '')),
      ),
      e(
        'tbody',
        null,
        props.rows.map((row, index) =>
          e(
            'tr',
            { key: index },
            e('td', { className: 'cell-source' }, e(CellContent, {
              kind: row.sourceKind || 'project',
              text: row.sourcePath,
            })),
            e('td', { className: 'cell-path' }, e(CellContent, {
              kind: row.deployKind || 'archive',
              text: row.deployPath,
            })),
            e('td', { className: 'cell-actions' },
              e('button', {
                className: 'icon-button',
                type: 'button',
                onClick: () => props.onRemove(row),
                title: 'Remove entry'
              }, 'Remove')
            ),
          ),
        ),
      ),
    );
  }

  function App() {
    const [entries, setEntries] = React.useState([]);
    const [projectName, setProjectName] = React.useState('');
    const [projectPath, setProjectPath] = React.useState('');

    React.useEffect(() => {
      const handler = (event) => {
        const message = event.data || {};
        if (message.type !== 'deploymentAssembly') {
          return;
        }
        const payload = message.payload || {};
        setEntries(Array.isArray(payload.entries) ? payload.entries : []);
        setProjectName(payload.projectName || '');
        setProjectPath(payload.projectPath || '');
      };
      window.addEventListener('message', handler);
      vscode.postMessage({ type: 'ready' });
      return () => window.removeEventListener('message', handler);
    }, []);

    const subtitle = projectName
      ? `Project: ${projectName}`
      : projectPath
        ? projectPath
        : 'Waiting for deployment assembly data';

    const handleAdd = (option) => {
      vscode.postMessage({ type: 'addEntry', option: option });
    };

    const handleRemove = (entry) => {
      vscode.postMessage({ type: 'removeEntry', entry: entry });
    };

    return e(
      'div',
      { className: 'page' },
      e(Header, {
        title: 'Deployment Assembly',
        subtitle: subtitle,
      }),
      e(
        'div',
        { className: 'panel' },
        e('div', { className: 'panel__meta' },
          e(Pill, null, 'Assembly Table'),
          e('span', { className: 'panel__count' }, entries.length + ' entries')
        ),
        e('div', { className: 'panel__actions' },
          e(AddMenu, { onSelect: handleAdd })
        ),
        e(AssemblyTable, { rows: entries, onRemove: handleRemove }),
      ),
    );
  }

  const root = document.getElementById('root');
  if (!root) return;

  if (ReactDOM.createRoot) {
    ReactDOM.createRoot(root).render(e(App));
  } else {
    ReactDOM.render(e(App), root);
  }
})();
