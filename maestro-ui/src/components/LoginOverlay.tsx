import React, { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '../stores/useAuthStore';

export function LoginOverlay(): React.JSX.Element {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const login = useAuthStore(s => s.login);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setError('');
    setLoading(true);
    const result = await login(password);
    setLoading(false);
    if (!result.ok) {
      setError(result.error || 'Login failed');
      setPassword('');
      inputRef.current?.focus();
    }
  };

  return (
    <div className="login-overlay">
      <div className="login-card">
        <div className="login-logo">
          <span className="login-logo-icon">M</span>
        </div>
        <h1 className="login-title">Agent Maestro</h1>
        <p className="login-subtitle">Enter password to continue</p>
        <form onSubmit={handleSubmit} className="login-form">
          <input
            ref={inputRef}
            type="password"
            className="login-input"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            disabled={loading}
            autoComplete="current-password"
          />
          {error && <p className="login-error">{error}</p>}
          <button type="submit" className="login-button" disabled={loading || !password}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
