import { useState, useCallback } from 'react';
import { initiatePayPalLinking, insertFundingSource } from './api';

export function useAutomation() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [extractedToken, setExtractedToken] = useState<string | null>(null);
  const [extractedPayerId, setExtractedPayerId] = useState<string | null>(null);

  const startInterception = useCallback(async (cookies: string, adAccountId: string) => {
    setLoading(true);
    setError(null);
    setSuccess(false);
    setExtractedToken(null);
    setExtractedPayerId(null);

    try {
      // 1. الحصول على رابط موافقة PayPal من Facebook عبر الباكإند
      const approvalUrl = await initiatePayPalLinking(cookies, adAccountId);

      // 2. فتح النافذة المنبثقة
      const width = 600, height = 600;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      const popup = window.open(
        approvalUrl,
        'paypal_popup',
        `width=${width},height=${height},left=${left},top=${top},resizable,scrollbars`
      );
      if (!popup) throw new Error('الرجاء السماح بالنوافذ المنبثقة');

      // 3. مراقبة تغيير عنوان النافذة (sniffer)
      const sniffer = new Promise<{ token: string; payerId: string }>((resolve, reject) => {
        const interval = setInterval(() => {
          try {
            if (popup.closed) {
              clearInterval(interval);
              reject(new Error('أُغلقت النافذة قبل الحصول على التوكن'));
              return;
            }
            let href: string;
            try {
              href = popup.location.href;
            } catch {
              // لا زالت في نطاق PayPal (cross-origin)
              return;
            }
            const url = new URL(href);
            const token = url.searchParams.get('token') || url.searchParams.get('token');
            const payerId = url.searchParams.get('payer_id') || url.searchParams.get('PayerID');
            if (token && payerId) {
              clearInterval(interval);
              resolve({ token, payerId });
            }
          } catch (e) {
            // تجاهل الأخطاء المؤقتة
          }
        }, 300);
      });

      const { token, payerId } = await sniffer;

      // 4. إغلاق النافذة فوراً لمنع إعادة التوجيه لفيسبوك
      setExtractedToken(token);
      setExtractedPayerId(payerId);
      popup.close();

      // 5. زرع وسيلة الدفع في الحساب الإعلاني
      await insertFundingSource(cookies, adAccountId, token, payerId);
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'خطأ غير معروف');
    } finally {
      setLoading(false);
    }
  }, []);

  return { startInterception, loading, error, success, extractedToken, extractedPayerId };
}
