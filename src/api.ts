import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || '';

export async function initiatePayPalLinking(cookies: string, adAccountId: string) {
  const { data } = await axios.post(`${API_BASE}/api/start-linking`, {
    cookies,
    adAccountId
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
