import React, { useState, useEffect } from 'react';
import API from '../../api';
import { Search, Crown, User as UserIcon } from 'lucide-react';

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await API.get('/api/admin/users');
        setUsers(data.users || []);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    };
    load();
  }, []);

  const filtered = users.filter(u =>
    u.name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div data-testid="admin-users">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--admin-text)' }}>Users</h1>
        <div style={{ position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--admin-text-secondary)' }} />
          <input data-testid="user-search" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search users..."
            style={{
              padding: '10px 14px 10px 36px', borderRadius: 8, border: '1px solid var(--admin-border)',
              background: 'var(--admin-surface)', color: 'var(--admin-text)', fontSize: 13, outline: 'none', width: 260,
            }} />
        </div>
      </div>

      {loading ? (
        <div style={{ color: 'var(--admin-text-secondary)', padding: 40 }}>Loading...</div>
      ) : (
        <div className="admin-table-wrap" style={{ background: 'var(--admin-surface)', borderRadius: 10, border: '1px solid var(--admin-border)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--admin-border)' }}>
                {['Name', 'Email', 'Tier', 'Role', 'Interests', 'Joined'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--admin-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((u, i) => (
                <tr key={u.id} data-testid={`user-row-${i}`} style={{ borderBottom: '1px solid var(--admin-border)' }}>
                  <td style={cellStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(196,151,59,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <UserIcon size={14} color="var(--gold)" />
                      </div>
                      <span style={{ fontWeight: 600, color: 'var(--admin-text)' }}>{u.name || 'N/A'}</span>
                    </div>
                  </td>
                  <td style={{ ...cellStyle, color: 'var(--admin-text-secondary)' }}>{u.email}</td>
                  <td style={cellStyle}>
                    <span style={{
                      padding: '3px 10px', borderRadius: 4, fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                      background: u.tier === 'pro' ? 'rgba(196,151,59,0.15)' : 'rgba(255,255,255,0.06)',
                      color: u.tier === 'pro' ? 'var(--gold)' : 'var(--admin-text-secondary)',
                    }}>
                      {u.tier === 'pro' && <Crown size={10} style={{ verticalAlign: '-1px', marginRight: 3 }} />}
                      {u.tier || 'free'}
                    </span>
                  </td>
                  <td style={{ ...cellStyle, color: 'var(--admin-text-secondary)' }}>{u.role}</td>
                  <td style={cellStyle}>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {(u.interests || []).slice(0, 3).map(c => (
                        <span key={c} className="badge-admin-category badge">{c}</span>
                      ))}
                    </div>
                  </td>
                  <td style={{ ...cellStyle, color: 'var(--admin-text-secondary)', fontSize: 12 }}>
                    {u.created_at ? new Date(u.created_at).toLocaleDateString() : 'N/A'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const cellStyle = { padding: '12px 16px', fontSize: 13 };
