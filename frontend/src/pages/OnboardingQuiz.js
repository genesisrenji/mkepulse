import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../api';
import { ChevronRight, ChevronLeft, Music, Utensils, Trophy, Palette, Users, Heart, DollarSign, MapPin, User, Bell } from 'lucide-react';

const CATEGORIES = [
  { id: 'concerts', label: 'Concerts', icon: Music },
  { id: 'food', label: 'Food & Drink', icon: Utensils },
  { id: 'sports', label: 'Sports', icon: Trophy },
  { id: 'arts', label: 'Arts & Culture', icon: Palette },
  { id: 'family', label: 'Family', icon: Users },
  { id: 'community', label: 'Community', icon: Heart },
];

const BUDGETS = [
  { value: 0, label: 'Free Only' },
  { value: 25, label: 'Up to $25' },
  { value: 40, label: 'Up to $40' },
  { value: 75, label: 'Up to $75' },
  { value: null, label: 'No Limit' },
];

const NEIGHBORHOODS = [
  { id: 'downtown', label: 'Downtown' }, { id: 'bay_view', label: 'Bay View' },
  { id: 'east_side', label: 'East Side' }, { id: 'riverwest', label: 'Riverwest' },
  { id: 'walkers_point', label: "Walker's Point" }, { id: 'brady_street', label: 'Brady Street' },
  { id: 'third_ward', label: 'Third Ward' }, { id: 'suburbs', label: 'Suburbs' },
  { id: 'anywhere', label: 'Anywhere' },
];

const GROUP_TYPES = [
  { id: 'solo', label: 'Solo' }, { id: 'partner', label: 'Partner' },
  { id: 'friends', label: 'Friends' }, { id: 'family', label: 'Family' },
];

const AGE_FILTERS = [
  { id: 'all', label: 'All Ages' }, { id: '18plus', label: '18+' }, { id: '21plus', label: '21+' },
];

const FREQUENCIES = [
  { id: 'realtime', label: 'Real-time', desc: 'Instant alerts for nearby events' },
  { id: 'smart', label: 'Smart Digest', desc: 'AI-curated, best moments only' },
  { id: 'daily', label: 'Daily', desc: "Tomorrow's events every evening" },
  { id: 'weekly', label: 'Weekly', desc: 'Weekend roundup every Thursday' },
];

export default function OnboardingQuiz() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({
    categories: [], budget_max: null, neighborhoods: [],
    group_type: null, age_filter: 'all', notif_frequency: 'smart',
    display_name: '', email: '',
  });
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  const toggle = (field, value) => {
    setAnswers(prev => {
      const arr = prev[field];
      return { ...prev, [field]: arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value] };
    });
  };

  const canNext = () => {
    if (step === 0) return answers.categories.length > 0;
    if (step === 2) return answers.neighborhoods.length > 0;
    if (step === 3) return answers.group_type;
    return true;
  };

  const handleFinish = async () => {
    setSaving(true);
    try {
      await API.post('/api/preferences', answers);
      navigate('/subscribe');
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const steps = [
    // Step 0: Categories
    () => (
      <div>
        <h2 style={headingStyle}>What events interest you?</h2>
        <p style={subStyle}>Select all that apply</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginTop: 24 }}>
          {CATEGORIES.map(c => {
            const Icon = c.icon;
            const active = answers.categories.includes(c.id);
            return (
              <button key={c.id} data-testid={`cat-${c.id}`} onClick={() => toggle('categories', c.id)}
                style={{
                  padding: '18px 16px', borderRadius: 12, border: `2px solid ${active ? 'var(--gold)' : 'var(--user-border)'}`,
                  background: active ? 'rgba(196,151,59,0.08)' : 'white', cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, transition: 'all 0.2s',
                }}>
                <Icon size={24} color={active ? 'var(--gold)' : 'var(--text-secondary)'} />
                <span style={{ fontWeight: 600, fontSize: 13, color: active ? 'var(--navy)' : 'var(--text-secondary)' }}>{c.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    ),

    // Step 1: Budget
    () => (
      <div>
        <h2 style={headingStyle}>What's your budget?</h2>
        <p style={subStyle}>We'll show events that match</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 24 }}>
          {BUDGETS.map(b => {
            const active = answers.budget_max === b.value;
            return (
              <button key={b.label} data-testid={`budget-${b.value}`}
                onClick={() => setAnswers(prev => ({ ...prev, budget_max: b.value }))}
                style={{
                  padding: '16px 20px', borderRadius: 12, cursor: 'pointer',
                  border: `2px solid ${active ? 'var(--gold)' : 'var(--user-border)'}`,
                  background: active ? 'rgba(196,151,59,0.08)' : 'white',
                  textAlign: 'left', fontWeight: 600, fontSize: 15, display: 'flex', alignItems: 'center', gap: 12,
                  color: active ? 'var(--navy)' : 'var(--text-secondary)', transition: 'all 0.2s',
                }}>
                <DollarSign size={20} color={active ? 'var(--gold)' : 'var(--text-secondary)'} />
                {b.label}
              </button>
            );
          })}
        </div>
      </div>
    ),

    // Step 2: Neighborhoods
    () => (
      <div>
        <h2 style={headingStyle}>Where do you hang out?</h2>
        <p style={subStyle}>Pick your neighborhoods</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 24 }}>
          {NEIGHBORHOODS.map(n => {
            const active = answers.neighborhoods.includes(n.id);
            return (
              <button key={n.id} data-testid={`hood-${n.id}`} onClick={() => toggle('neighborhoods', n.id)}
                style={{
                  padding: '10px 18px', borderRadius: 24, cursor: 'pointer',
                  border: `2px solid ${active ? 'var(--gold)' : 'var(--user-border)'}`,
                  background: active ? 'rgba(196,151,59,0.08)' : 'white',
                  fontWeight: 600, fontSize: 13, color: active ? 'var(--navy)' : 'var(--text-secondary)',
                  transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 6,
                }}>
                <MapPin size={14} /> {n.label}
              </button>
            );
          })}
        </div>
      </div>
    ),

    // Step 3: Group + Age
    () => (
      <div>
        <h2 style={headingStyle}>Who are you going with?</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginTop: 24 }}>
          {GROUP_TYPES.map(g => {
            const active = answers.group_type === g.id;
            return (
              <button key={g.id} data-testid={`group-${g.id}`}
                onClick={() => setAnswers(prev => ({ ...prev, group_type: g.id }))}
                style={{
                  padding: '16px', borderRadius: 12, cursor: 'pointer',
                  border: `2px solid ${active ? 'var(--gold)' : 'var(--user-border)'}`,
                  background: active ? 'rgba(196,151,59,0.08)' : 'white',
                  fontWeight: 600, fontSize: 14, color: active ? 'var(--navy)' : 'var(--text-secondary)', transition: 'all 0.2s',
                }}>
                {g.label}
              </button>
            );
          })}
        </div>
        <div style={{ marginTop: 24 }}>
          <p style={{ ...subStyle, marginBottom: 12 }}>Age preference</p>
          <div style={{ display: 'flex', gap: 10 }}>
            {AGE_FILTERS.map(a => {
              const active = answers.age_filter === a.id;
              return (
                <button key={a.id} data-testid={`age-${a.id}`}
                  onClick={() => setAnswers(prev => ({ ...prev, age_filter: a.id }))}
                  style={{
                    flex: 1, padding: '12px', borderRadius: 10, cursor: 'pointer',
                    border: `2px solid ${active ? 'var(--gold)' : 'var(--user-border)'}`,
                    background: active ? 'rgba(196,151,59,0.08)' : 'white',
                    fontWeight: 600, fontSize: 13, color: active ? 'var(--navy)' : 'var(--text-secondary)', transition: 'all 0.2s',
                  }}>
                  {a.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    ),

    // Step 4: Notification Frequency
    () => (
      <div>
        <h2 style={headingStyle}>How often should we notify you?</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 24 }}>
          {FREQUENCIES.map(f => {
            const active = answers.notif_frequency === f.id;
            return (
              <button key={f.id} data-testid={`freq-${f.id}`}
                onClick={() => setAnswers(prev => ({ ...prev, notif_frequency: f.id }))}
                style={{
                  padding: '16px 20px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                  border: `2px solid ${active ? 'var(--gold)' : 'var(--user-border)'}`,
                  background: active ? 'rgba(196,151,59,0.08)' : 'white', transition: 'all 0.2s',
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Bell size={18} color={active ? 'var(--gold)' : 'var(--text-secondary)'} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: active ? 'var(--navy)' : 'var(--text-primary)' }}>{f.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{f.desc}</div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    ),

    // Step 5: Name + Email
    () => (
      <div>
        <h2 style={headingStyle}>Almost done!</h2>
        <p style={subStyle}>Confirm your details</p>
        <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={labelStyle}>Display Name</label>
            <input data-testid="onboard-name" type="text" value={answers.display_name}
              onChange={e => setAnswers(prev => ({ ...prev, display_name: e.target.value }))}
              placeholder="What should we call you?" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Email (for notifications)</label>
            <input data-testid="onboard-email" type="email" value={answers.email}
              onChange={e => setAnswers(prev => ({ ...prev, email: e.target.value }))}
              placeholder="your@email.com" style={inputStyle} />
          </div>
        </div>
      </div>
    ),
  ];

  return (
    <div data-testid="onboarding-quiz" style={{ minHeight: '100vh', background: 'var(--cream)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div className="animate-fade-in-up" style={{ width: '100%', maxWidth: 460 }}>
        {/* Progress */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 32 }}>
          {[0,1,2,3,4,5].map(i => (
            <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= step ? 'var(--gold)' : 'rgba(14,34,64,0.1)', transition: 'background 0.3s' }} />
          ))}
        </div>

        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 8 }}>
          Step {step + 1} of 6
        </div>

        {/* Content */}
        <div key={step} className="animate-fade-in" style={{ background: 'white', borderRadius: 16, padding: '32px 28px', border: '1px solid var(--user-border)', boxShadow: '0 4px 24px rgba(14,34,64,0.06)', minHeight: 320 }}>
          {steps[step]()}
        </div>

        {/* Navigation */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
          <button data-testid="quiz-back"
            onClick={() => step > 0 && setStep(step - 1)}
            style={{ padding: '12px 24px', borderRadius: 10, border: '1px solid var(--user-border)', background: 'white', cursor: step > 0 ? 'pointer' : 'default', opacity: step > 0 ? 1 : 0.4, fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-primary)' }}>
            <ChevronLeft size={16} /> Back
          </button>
          {step < 5 ? (
            <button data-testid="quiz-next" onClick={() => canNext() && setStep(step + 1)} disabled={!canNext()}
              style={{
                padding: '12px 28px', borderRadius: 10, border: 'none', background: 'var(--gold)',
                color: 'var(--admin-bg)', fontWeight: 700, fontSize: 14, cursor: canNext() ? 'pointer' : 'default',
                opacity: canNext() ? 1 : 0.5, display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s',
              }}>
              Next <ChevronRight size={16} />
            </button>
          ) : (
            <button data-testid="quiz-finish" onClick={handleFinish} disabled={saving}
              style={{
                padding: '12px 28px', borderRadius: 10, border: 'none', background: 'var(--gold)',
                color: 'var(--admin-bg)', fontWeight: 700, fontSize: 14, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6, opacity: saving ? 0.7 : 1,
              }}>
              {saving ? 'Saving...' : 'Start Exploring'} <ChevronRight size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const headingStyle = { fontSize: 24, fontWeight: 800, color: 'var(--navy)', letterSpacing: '-0.02em' };
const subStyle = { fontSize: 14, color: 'var(--text-secondary)', marginTop: 4 };
const labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.1em' };
const inputStyle = { width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--user-border)', fontSize: 14, outline: 'none', background: 'var(--cream)', fontFamily: 'inherit' };
