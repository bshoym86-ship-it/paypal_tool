import axios from 'axios';
const API_BASE = import.meta.env.VITE_API_URL || '';

// تعديل الدالة لاستقبال fb_dtsg كوسيط
export async function initiatePayPalLinking(cookies: string, adAccountId: string, fbDtsg: string) {
  const { data } = await axios.post(`${API_BASE}/api/start-linking`, {
    cookies,
    adAccountId,
    fbDtsg // إرسال التوكن المستخرج
  });
  return data.approvalUrl as string;
}

export async function insertFundingSource(
  cookies: string,
  adAccountId: string,
  paymentToken: string,
  payerId: string
) {
  const { data } = await axios.post(`${API_BASE}/api/insert-funding-source`, {
    cookies,
    adAccountId,
    paymentToken,
    payerId
  });
  return data;
}
