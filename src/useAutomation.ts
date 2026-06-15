import { useState, useCallback } from 'react';
import { initiatePayPalLinking, insertFundingSource } from './api';

export function useAutomation() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [extractedToken, setExtractedToken] = useState<string | null>(null);
  const [extractedPayerId, setExtractedPayerId] = useState<string | null>(null);

  // دالة استخراج التوكن من المتصفح الحالي
  const getClientFbDtsg = (): string | null => {
    try {
      // 1. محاولة الاستخراج من Modules (الأكثر دقة)
      const require = (window as any).require;
      if (require) {
        const DTSGInitialData = require("DTSGInitialData")?.token;
        const DTSGInitData = require("DTSGInitData")?.token;
        if (DTSGInitialData || DTSGInitData) return DTSGInitialData || DTSGInitData;
      }

      // 2. محاولة الاستخراج من DOM Elements
      const inputDtsg = document.querySelector('input[name="fb_dtsg"]') as HTMLInputElement;
      if (inputDtsg && inputDtsg.value) return inputDtsg.value;

      // 3. محاولة الاستخراج من Global Variable
      if ((window as any).__DTSG?.token) return (window as any).__DTSG.token;

      // 4. محاولة الاستخراج من الكوكيز
      const cookieMatch = document.cookie.match(/dtsg_ag=([^;]+)/);
      if (cookieMatch && cookieMatch[1]) return cookieMatch[1];
      
      // محاولة أخرى من الكوكيز القديمة
      const cookieDtsg = document.cookie.match(/fb_dtsg=([^;]+)/);
      if (cookieDtsg && cookieDtsg[1]) return cookieDtsg[1];

    } catch (e) {
      console.error("فشل استخراج التوكن من المتصفح", e);
    }
    return null;
  };

  const startInterception = useCallback(async (cookies: string, adAccountId: string) => {
    setLoading(true);
    setError(null);
    setSuccess(false);
    setExtractedToken(null);
    setExtractedPayerId(null);

    try {
      // استخراج التوكن من المتصفح قبل البدء
      const fbDtsg = getClientFbDtsg();
      if (!fbDtsg) {
        throw new Error('فشل استخراج رمز الأمان (fb_dtsg) تلقائياً. تأكد أنك مسجل الدخول في نفس المتصفح.');
      }

      // 1. إرسال الطلب للسيرفر مع التوكن الجاهز
      const approvalUrl = await initiatePayPalLinking(cookies, adAccountId, fbDtsg);

      // 2. فتح النافذة المنبثقة
      const width = 600;
      const height = 600;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;

      const popup = window.open(
        approvalUrl,
        'paypal_popup',
        `width=${width},height=${height},left=${left},top=${top},resizable,scrollbars`
      );

      if (!popup) {
        throw new Error('الرجاء السماح بالنوافذ المنبثقة (Pop-ups)');
      }

      // 3. مراقبة الرابط
      const sniffer = new Promise<{ token: string; payerId: string }>((resolve, reject) => {
        const interval = setInterval(() => {
          try {
            if (popup.closed) {
              clearInterval(interval);
              reject(new Error('أُغلقت النافذة قبل إتمام العملية'));
              return;
            }
            // محاولة قراءة الرابط (قد تفشل بسبب سياسة المتصفح وهذا طبيعي)
            try {
              const href = popup.location.href;
              const url = new URL(href);
              const token = url.searchParams.get('token');
              const payerId = url.searchParams.get('payer_id') || url.searchParams.get('PayerID');
              
              if (token && payerId) {
                clearInterval(interval);
                resolve({ token, payerId });
              }
            } catch {
              // تجاهل أخطاء الـ Cross-Origin
            }
          } catch (e) {}
        }, 300);
      });

      const { token, payerId } = await sniffer;
      popup.close();
      
      setExtractedToken(token);
      setExtractedPayerId(payerId);

      // 5. زرع وسيلة الدفع
      await insertFundingSource(cookies, adAccountId, token, payerId);
      setSuccess(true);
      
    } catch (err: any) {
      const serverMessage = err.response?.data?.error;
      setError(serverMessage || err.message || 'حدث خطأ غير متوقع');
    } finally {
      setLoading(false);
    }
  }, []);

  return { startInterception, loading, error, success, extractedToken, extractedPayerId };
}
