(function () {
  const e = React.createElement;
  const vscode = acquireVsCodeApi();

  function Header(props) {
    return e(
      'div',
      { className: 'header' },
      e('div', { className: 'header__title' }, props.title),
      e('div', { className: 'header__subtitle' }, props.subtitle)
    );
  }

  function EmptyState() {
    return e('div', { className: 'empty' }, 'No JVM system properties defined.');
  }

  function PropertyRow(props) {
    return e(
      'tr',
      null,
      e('td', null,
        e('input', {
          type: 'text',
          value: props.entry.name || '',
          placeholder: 'property.name',
          onChange: (evt) => props.onChange(props.index, { name: evt.target.value })
        })
      ),
      e('td', null,
        e('input', {
          type: 'text',
          value: props.entry.value || '',
          placeholder: 'value',
          onChange: (evt) => props.onChange(props.index, { value: evt.target.value })
        })
      ),
      e('td', { className: 'table__actions' },
        e('button', { className: 'btn btn--danger', type: 'button', onClick: () => props.onRemove(props.index) }, 'Remove')
      )
    );
  }

  function PropertiesTable(props) {
    if (!props.entries.length) {
      return e(EmptyState);
    }
    return e(
      'table',
      { className: 'table' },
      e('thead', null,
        e('tr', null,
          e('th', null, 'Name'),
          e('th', null, 'Value'),
          e('th', null, '')
        )
      ),
      e('tbody', null,
        props.entries.map((entry, idx) =>
          e(PropertyRow, {
            key: idx,
            entry: entry,
            index: idx,
            onChange: props.onChange,
            onRemove: props.onRemove
          })
        )
      )
    );
  }

  function App() {
    const [entries, setEntries] = React.useState([]);
    const [subtitle, setSubtitle] = React.useState('');

    React.useEffect(() => {
      const handler = (event) => {
        const message = event.data || {};
        if (message.type !== 'jvmProperties') {
          return;
        }
        const payload = message.payload || {};
        setEntries(Array.isArray(payload.entries) ? payload.entries : []);
        setSubtitle(payload.subtitle || 'Edit WebSphere JVM system properties.');
      };
      window.addEventListener('message', handler);
      vscode.postMessage({ type: 'ready' });
      return () => window.removeEventListener('message', handler);
    }, []);

    const updateEntry = (index, changes) => {
      setEntries((prev) => prev.map((entry, idx) => idx === index ? Object.assign({}, entry, changes) : entry));
    };

    const removeEntry = (index) => {
      setEntries((prev) => prev.filter((_, idx) => idx !== index));
    };

    const addEntry = () => {
      setEntries((prev) => prev.concat([{ name: '', value: '' }]));
    };

    const save = () => {
      vscode.postMessage({ type: 'save', entries: entries });
    };

    const cancel = () => {
      vscode.postMessage({ type: 'cancel' });
    };

    return e(
      'div',
      { className: 'page' },
      e(Header, { title: 'WebSphere JVM Properties', subtitle: subtitle }),
      e('div', { className: 'panel' },
        e('div', { className: 'panel__meta' },
          e('div', { className: 'panel__title' },
            'System Properties',
            e('span', { className: 'panel__count' }, String(entries.length))
          ),
          e('div', { className: 'panel__actions' },
            e('button', { className: 'btn', type: 'button', onClick: addEntry }, 'Add')
          )
        ),
        e(PropertiesTable, { entries: entries, onChange: updateEntry, onRemove: removeEntry }),
        e('div', { className: 'footer' },
          e('button', { className: 'btn btn--ghost', type: 'button', onClick: cancel }, 'Cancel'),
          e('button', { className: 'btn', type: 'button', onClick: save }, 'Save')
        )
      )
    );
  }

  ReactDOM.render(e(App), document.getElementById('root'));
})();
