import { useState } from 'react';
import { ProfileTab } from './ProfileTab';
import { TryOnTab } from './TryOnTab';

type Tab = 'profile' | 'tryon';

const TABS: { id: Tab; label: string }[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'tryon', label: 'Try on' },
];

export function App() {
  const [tab, setTab] = useState<Tab>('profile');

  return (
    <main className="app">
      <header className="header">
        <h1>Virtual Fit</h1>
        <p>See how a top fits you before you buy.</p>
      </header>
      <div role="tablist" className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <section role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="card">
        {tab === 'profile' ? (
          <ProfileTab />
        ) : (
          <TryOnTab goProfile={() => setTab('profile')} />
        )}
      </section>
    </main>
  );
}
