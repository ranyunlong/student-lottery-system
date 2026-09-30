'use client';

import { useRef, useState, type FormEvent, type PointerEvent } from 'react';
import { createAuthClient } from 'better-auth/react';
import { Eye, EyeOff, LoaderCircle, LockKeyhole, Mail, ShieldCheck, TicketCheck, X } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { StatusMessage } from '../../../components/ui/status-message';
import { LoginBackground } from './login-background';
import styles from './login.module.css';

const authClient = createAuthClient();

export default function LoginPage() {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const mascotRef = useRef<HTMLDivElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  function lookAtPointer(event: PointerEvent<HTMLElement>) {
    const mascot = mascotRef.current;
    if (!mascot || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const rect = mascot.getBoundingClientRect();
    const x = event.clientX - (rect.left + rect.width / 2);
    const y = event.clientY - (rect.top + rect.height / 2);
    mascot.style.setProperty('--look-x', `${Math.max(-5, Math.min(5, x / 35))}px`);
    mascot.style.setProperty('--look-y', `${Math.max(-4, Math.min(4, y / 45))}px`);
  }

  function resetLook() {
    mascotRef.current?.style.setProperty('--look-x', '0px');
    mascotRef.current?.style.setProperty('--look-y', '0px');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const result = await authClient.signIn.email({ email: String(form.get('email')), password: String(form.get('password')) });
    setBusy(false);
    if (result.error) { setError('邮箱或密码错误，或账号已停用'); return; }
    const signedInUser = result.data?.user as typeof result.data.user & { mustChangePassword?: boolean };
    window.location.assign(signedInUser?.mustChangePassword ? '/change-password' : '/');
  }

  return <main onPointerMove={lookAtPointer} onPointerLeave={resetLook} className={`${styles.scene} relative grid min-h-dvh place-items-center overflow-hidden px-4 py-14 sm:px-8`}>
    <LoginBackground />
    <section className={`${styles.card} relative z-10 w-full max-w-[27rem] rounded-lg px-6 py-8 sm:px-9 sm:py-10`}>
      <div ref={mascotRef} data-testid="login-mascot" aria-hidden="true" className={styles.mascot}>
        <div className={styles.hat} /><div className={styles.hair} />
        <div className={styles.face}><span className={styles.eye}><i /></span><span className={styles.eye}><i /></span><span className={styles.cheek} /><span className={styles.cheek} /><span className={styles.smile} /></div>
        <div className={styles.armLeft} /><div className={styles.armRight} />
      </div>
      <div className="mb-8 flex items-center gap-3 pr-14">
        <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-md bg-workspace-accent text-white"><TicketCheck className="size-5" /></span>
        <h1 className={`${styles.brandTitle} min-w-0 break-words leading-tight`}>幸运游园会</h1>
      </div>
      <form aria-label="账号登录" onSubmit={submit} className="flex flex-col gap-4">
        <div className="min-w-0"><label htmlFor="login-email" className="mb-1.5 block text-sm font-medium text-workspace-ink">邮箱</label><div className={styles.inputWrap}><Mail aria-hidden="true" className={styles.fieldIcon} /><Input id="login-email" ref={emailRef} className="login-field pl-10 pr-11" name="email" type="email" required autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} />{email && <button type="button" aria-label="清空邮箱" title="清空邮箱" className={styles.fieldAction} onClick={() => { setEmail(''); emailRef.current?.focus(); }}><X aria-hidden="true" className="size-4" /></button>}</div></div>
        <div className="min-w-0"><label htmlFor="login-password" className="mb-1.5 block text-sm font-medium text-workspace-ink">密码</label><div className={styles.inputWrap}><LockKeyhole aria-hidden="true" className={styles.fieldIcon} /><Input id="login-password" ref={passwordRef} className="login-field pl-10 pr-20" name="password" type={passwordVisible ? 'text' : 'password'} required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />{password && <button type="button" aria-label="清空密码" title="清空密码" className={`${styles.fieldAction} ${styles.clearPassword}`} onClick={() => { setPassword(''); passwordRef.current?.focus(); }}><X aria-hidden="true" className="size-4" /></button>}<button type="button" aria-label={passwordVisible ? '隐藏密码' : '显示密码'} title={passwordVisible ? '隐藏密码' : '显示密码'} className={styles.fieldAction} onClick={() => { setPasswordVisible((value) => !value); passwordRef.current?.focus(); }}>{passwordVisible ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}</button></div></div>
        {error && <StatusMessage role="alert" tone="error" className="rounded-md">{error}</StatusMessage>}
        <Button type="submit" disabled={busy} className="mt-2 w-full" icon={busy ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" /> : <ShieldCheck aria-hidden="true" className="size-4" />}>{busy ? '登录中…' : '登录'}</Button>
      </form>
    </section>
    <footer className={styles.footer}>© 2026 幸运游园会 Designed by <a href="https://www.mininglamp.com/" target="_blank" rel="noopener noreferrer">Mininglamp</a></footer>
  </main>;
}
