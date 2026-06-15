import React, { useState } from 'react';
import { useAutomation } from './useAutomation';
import './App.css';

function normalizeAdAccountId(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.startsWith('act_') ? trimmed : `act_${trimmed}`;
}

function App() {
  const [cookies, setCookies] = useState('');
  const [adAccountId, setAdAccountId] = useState('');
  const { startInterception, loading, error, success, extractedToken, extractedPayerId } = useAutomation();

  const handleStart = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cookies || !adAccountId) return;

    const normalizedAdAccountId = normalizeAdAccountId(adAccountId);
    startInterception(cookies, normalizedAdAccountId);
  };

  return (
    <div className="dark-mode">
      <div className="container">
        <div className="brand-wrap">
          <div>
            <div className="badge">⚡ ClickBridge</div>
            <h1>أداة ربط PayPal بحساب الإعلانات</h1>
          </div>
          <div className="badge">Live</div>
        </div>
        <p className="subtitle">واجهة بسيطة وسريعة لإدخال الكوكيز ومعرف الحساب، مع نتائج واضحة وخطوات واضحة.</p>

        <div className="form-card">
          <form onSubmit={handleStart}>
            <label htmlFor="cookies">ملفات تعريف الارتباط (Cookies)</label>
            <textarea
              id="cookies"
              rows={5}
              value={cookies}
              onChange={e => setCookies(e.target.value)}
              placeholder="الصق الكوكيز كاملة من المتصفح (c_user=...; xs=...; fr=...; datr=...; sb=...)"
              required
            />

            <label htmlFor="adAccount">معرف الحساب الإعلاني (Ad Account ID)</label>
            <input
              id="adAccount"
              type="text"
              value={adAccountId}
              onChange={e => setAdAccountId(e.target.value)}
              placeholder="123456789 أو act_123456789"
              required
            />

            <button type="submit" disabled={loading} className="paypal-btn">
              {loading ? 'جارٍ المعالجة...' : 'PayPal • بدء الربط'}
            </button>
          </form>
        </div>

        {error && <div className="alert alert-error">❌ {error}</div>}
        {success && <div className="alert alert-success">✅ تم زرع وسيلة الدفع بنجاح!</div>}
        {extractedToken && extractedPayerId && (
          <div className="alert alert-info">
            🎯 تم خطف البيانات: token = {extractedToken.substring(0, 12)}... / payer_id = {extractedPayerId}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
