import React, { useState } from 'react';
import { useAutomation } from './useAutomation';
import './App.css';

function App() {
  const [cookies, setCookies] = useState('');
  const [adAccountId, setAdAccountId] = useState('');
  const { startInterception, loading, error, success, extractedToken, extractedPayerId } = useAutomation();

  const handleStart = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cookies || !adAccountId) return;
    startInterception(cookies, adAccountId);
  };

  return (
    <div className="dark-mode">
      <div className="container">
        <h1>⚡ Meta Pay Interceptor</h1>
        <p className="subtitle">أداة ربط بايبال بحساب الإعلانات دون تثبيت</p>

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
            placeholder="act_123456789"
            required
          />

          <button type="submit" disabled={loading}>
            {loading ? 'جارٍ المعالجة...' : 'بدء الربط'}
          </button>
        </form>

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
