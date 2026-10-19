'use client';
import { useState } from 'react';
import { Eye, EyeOff, LockKeyhole, LoaderCircle } from 'lucide-react';
import { login } from '@/app/login/actions';
import { Button } from './ui/button';
export function LoginForm() {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [showPassword, setShowPassword] = useState(false);
  return (
    <form
      className="stack-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        const form = new FormData(event.currentTarget);
        setBusy(true);
        setError('');
        try {
          const result = await login(form);
          if (result) setError(result.error);
        } catch {
          setError('Sign-in could not complete. Please try again.');
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        Email address
        <input
          type="email"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          name="email"
          autoComplete="username"
          required
          placeholder="admin@example.edu.bd"
          maxLength={200}
        />
      </label>
      <label>
        Password
        <span className="password-field">
          <input
            type={showPassword ? 'text' : 'password'}
            name="password"
            autoComplete="current-password"
            required
            minLength={8}
            maxLength={128}
          />
          <button
            type="button"
            className="password-toggle"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            aria-pressed={showPassword}
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
          </button>
        </span>
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <Button disabled={busy}>
        {busy ? <LoaderCircle className="spin" size={16} /> : <LockKeyhole size={16} />}
        {busy ? 'Signing in…' : 'Sign in to dashboard'}
      </Button>
      <p className="field-hint">
        Administrator access is assigned securely by the application owner.
      </p>
    </form>
  );
}
