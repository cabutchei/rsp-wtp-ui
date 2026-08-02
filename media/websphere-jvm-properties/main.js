(function () {
  const e = React.createElement;
  const vscode = acquireVsCodeApi();
  const searchIcon = e(
    'svg',
    {
      viewBox: '0 0 16 16',
      width: '16',
      height: '16',
      'aria-hidden': 'true'
    },
    e('path', {
      fill: 'currentColor',
      d: 'M11.08 10.18l3.37 3.37-.9.9-3.37-3.37a5 5 0 1 1 .9-.9zM6.5 10.25a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5z'
    })
  );

  function Header(props) {
    return e(
      'div',
      { className: 'header' },
      e('div', { className: 'header__title' }, props.title)
    );
  }

  function EmptyState(props) {
    return e(
      'tr',
      { className: 'table__emptyRow' },
      e('td', { className: 'empty', colSpan: 3 }, props.message)
    );
  }

  function PropertyRow(props) {
    return e(
      'tr',
      { className: props.isDraft ? 'table__draftRow' : null },
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
        props.isDraft
          ? e(
              'button',
              {
                className: 'btn btn--icon',
                type: 'button',
                title: 'Add property',
                disabled: !props.canAdd,
                onClick: props.onAdd
              },
              '+'
            )
          : e(
              'button',
              {
                className: 'btn btn--danger btn--icon',
                type: 'button',
                title: 'Remove property',
                onClick: () => props.onRemove(props.index)
              },
              '−'
            )
      )
    );
  }

  function PropertiesTable(props) {
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
        props.entries.map((item) =>
          e(PropertyRow, {
            key: item.index,
            entry: item.entry,
            index: item.index,
            onChange: props.onChange,
            onRemove: props.onRemove
          })
        ),
        !props.entries.length
          ? e(EmptyState, {
              message: props.emptyMessage || 'No JVM system properties defined.'
            })
          : null,
        e(PropertyRow, {
          key: 'draft',
          isDraft: true,
          entry: props.draftEntry,
          canAdd: props.canAdd,
          onChange: props.onDraftChange,
          onAdd: props.onAdd
        })
      )
    );
  }

  function App() {
    const [entries, setEntries] = React.useState([]);
    const [mode, setMode] = React.useState('workflow');
    const [filterText, setFilterText] = React.useState('');
    const [draftEntry, setDraftEntry] = React.useState({ name: '', value: '' });

    React.useEffect(() => {
      const handler = (event) => {
        const message = event.data || {};
        if (message.type !== 'jvmProperties') {
          return;
        }
        const payload = message.payload || {};
        setEntries(Array.isArray(payload.entries) ? payload.entries : []);
        setMode(payload.mode === 'document' ? 'document' : 'workflow');
        setDraftEntry({ name: '', value: '' });
      };
      window.addEventListener('message', handler);
      vscode.postMessage({ type: 'ready' });
      return () => window.removeEventListener('message', handler);
    }, []);

    const applyEntries = (nextEntries) => {
      setEntries(nextEntries);
      if (mode === 'document') {
        vscode.postMessage({ type: 'update', entries: nextEntries });
      }
    };

    const updateEntry = (index, changes) => {
      const nextEntries = entries.map((entry, idx) => idx === index ? Object.assign({}, entry, changes) : entry);
      applyEntries(nextEntries);
    };

    const removeEntry = (index) => {
      applyEntries(entries.filter((_, idx) => idx !== index));
    };

    const updateDraftEntry = (_, changes) => {
      setDraftEntry(Object.assign({}, draftEntry, changes));
    };

    const addDraftEntry = () => {
      if (!draftEntry.name || !draftEntry.name.trim()) {
        return;
      }
      applyEntries(entries.concat([{
        name: draftEntry.name,
        value: draftEntry.value || ''
      }]));
      setDraftEntry({ name: '', value: '' });
    };

    const save = () => {
      if (mode === 'document') {
        vscode.postMessage({ type: 'saveDocument' });
        return;
      }
      vscode.postMessage({ type: 'save', entries: entries });
    };

    const cancel = () => {
      vscode.postMessage({ type: 'cancel' });
    };

    const normalizedFilter = filterText.trim().toLowerCase();
    const filteredEntries = normalizedFilter
      ? entries
          .map((entry, index) => ({ entry: entry, index: index }))
          .filter(({ entry }) => {
            const name = (entry.name || '').toLowerCase();
            const value = (entry.value || '').toLowerCase();
            return name.includes(normalizedFilter) || value.includes(normalizedFilter);
          })
      : entries.map((entry, index) => ({ entry: entry, index: index }));

    const emptyMessage = entries.length
      ? 'No JVM system properties match the current filter.'
      : 'No JVM system properties defined.';
    const canAddDraftEntry = !!(draftEntry.name && draftEntry.name.trim());

    return e(
      'div',
      { className: 'page' },
      e(Header, { title: 'WebSphere JVM Properties', mode: mode }),
      e('div', { className: 'panel' },
        e('div', { className: 'panel__meta' },
          e('div', { className: 'panel__title' },
            'System Properties',
            e('span', { className: 'panel__count' }, String(entries.length))
          ),
          e('div', { className: 'panel__actions' },
            e('label', { className: 'panel__filterWrap', title: 'Filter properties' },
              e('span', { className: 'panel__filterIcon' }, searchIcon),
              e('input', {
                className: 'panel__filter',
                type: 'search',
                value: filterText,
                onChange: (evt) => setFilterText(evt.target.value)
              })
            )
          )
        ),
        e(PropertiesTable, {
          entries: filteredEntries,
          emptyMessage: emptyMessage,
          draftEntry: draftEntry,
          canAdd: canAddDraftEntry,
          onChange: updateEntry,
          onRemove: removeEntry,
          onDraftChange: updateDraftEntry,
          onAdd: addDraftEntry
        }),
        mode === 'document'
          ? null
          : e('div', { className: 'footer' },
              e('button', { className: 'btn btn--ghost', type: 'button', onClick: cancel }, 'Cancel'),
              e('button', { className: 'btn', type: 'button', onClick: save }, 'Save')
            )
      )
    );
  }

  ReactDOM.render(e(App), document.getElementById('root'));
})();
