import { useState, useCallback } from 'react';
import { initiatePayPalLinking, insertFundingSource } from './api';

export function useAutomation() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [extractedToken, setExtractedToken] = useState<string | null>(null);
  const [extractedPayerId, setExtractedPayerId] = useState<string | null>(null);
  const [needsManualDtsg, setNeedsManualDtsg] = useState(false);

  const startInterception = useCallback(async (cookies: string, adAccountId: string, fbDtsg?: string) => {
    setLoading(true);
    setError(null);
    setSuccess(false);
    setExtractedToken(null);
    setExtractedPayerId(null);
    setNeedsManualDtsg(false);

    try {
      // إرسال الطلب للسيرفر - السيرفر يستخرج fb_dtsg تلقائياً من الكوكيز
      // أو يستخدم الـ fbDtsg اليدوي لو المستخدم دخله
      const approvalUrl = await initiatePayPalLinking(cookies, adAccountId, fbDtsg);

      // فتح النافذة المنبثقة
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
        throw new Error('الرجاء السماح بالنوافذ المنبثقة (Pop-ups) في المتصفح');
      }

      // مراقبة الرابط واستخراج token + payer_id
      const sniffer = new Promise<{ token: string; payerId: string }>((resolve, reject) => {
        const startTime = Date.now();
        const timeout = 5 * 60 * 1000; // 5 دقائق timeout

        const interval = setInterval(() => {
          try {
            if (Date.now() - startTime > timeout) {
              clearInterval(interval);
              popup.close();
              reject(new Error('انتهى الوقت المسموح. جرب مرة أخرى.'));
              return;
            }

            if (popup.closed) {
              clearInterval(interval);
              reject(new Error('أُغلقت النافذة قبل إتمام العملية'));
              return;
            }

            // محاولة قراءة الرابط (قد تفشل بسبب سياسة المتصفح وهذا طبيعي)
            try {
              const href = popup.location.href;
              if (href && href.includes('paypal.com') && (href.includes('token=') || href.includes('PayerID='))) {
                const url = new URL(href);
                const token = url.searchParams.get('token');
                const payerId = url.searchParams.get('payer_id') || url.searchParams.get('PayerID');

                if (token && payerId) {
                  clearInterval(interval);
                  resolve({ token, payerId });
                }
              }
            } catch {
              // تجاهل أخطاء الـ Cross-Origin - هذا طبيعي جداً
            }
          } catch (e) {
            // تجاهل أي أخطاء أخرى
          }
        }, 300);
      });

      const { token, payerId } = await sniffer;
      popup.close();

      setExtractedToken(token);
      setExtractedPayerId(payerId);

      // زرع وسيلة الدفع
      await insertFundingSource(cookies, adAccountId, token, payerId);
      setSuccess(true);

    } catch (err: any) {
      const serverMessage = err.response?.data?.error;
      const needsManual = err.response?.data?.needsManualDtsg;

      if (needsManual) {
        setNeedsManualDtsg(true);
      }

      setError(serverMessage || err.message || 'حدث خطأ غير متوقع');
    } finally {
      setLoading(false);
    }
  }, []);

  return { startInterception, loading, error, success, extractedToken, extractedPayerId, needsManualDtsg };
}
