// server.js
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080; // Railway uses 8080 usually

app.use(cors());
app.use(express.json());

// ========== دوال مساعدة ==========
function getCookieValue(cookies, name) {
  const cleanCookies = cookies.replace(/;\s*/g, ';');
  const match = cleanCookies.match(new RegExp(`(?:^|;)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function normalizeAdAccountId(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  return trimmed.startsWith('act_') ? trimmed : `act_${trimmed}`;
}

// تنفيذ GraphQL لربط PayPal
async function initPayPalLink(cookies, fbDtsg, userId) {
  // تم تحديث User-Agent ليكون مطابقاً للمتصفح تماماً
  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

  const variables = {
    input: {
      mutation_params: {
        close_url: "https://secure.facebook.com/payments/redirect/?instance_id=6fe12dd2-c2e2-4ab0-a842-a01e094fbd9b&target_domain=https%3A%2F%2Faccountscenter.facebook.com&type=rp",
        login_ref_id: "6fe12dd2-c2e2-4ab0-a842-a01e094fbd9b"
      },
      profile_id: "FXACINFRAOBIDPERVIEWERAVMwhxCKmjhHOsHYDHD2jJttp4MJMP0zcJb-tOnHowAUfL3PcWtQEL4CVskvwI4eC03vgkFlaYWgsVgu8VTFoQzDkQ",
      actor_id: userId,
      client_mutation_id: "3"
    }
  };

  const body = new URLSearchParams({
    __a: "1",
    __req: "17",
    __hs: "20618.HYP:accounts_center_pkg.2.1..0",
    dpr: "1",
    __ccg: "UNKNOWN",
    __rev: "1041437765",
    __s: "3zgi2m:uc0vqk:jd0d7n",
    __hsi: "7651186107637418310",
    fb_dtsg: fbDtsg, // استخدام التوكن المستلم
    jazoest: "25481",
    lsd: "KwP0jGeBpHXvN5AOyE1svL",
    fb_api_caller_class: "RelayModern",
    fb_api_req_friendly_name: "useMetaPayWalletInitPayPalLinkingMutation",
    server_timestamps: "true",
    variables: JSON.stringify(variables),
    doc_id: "9816934428383981"
  }).toString();

  try {
    const { data } = await axios.post(
      'https://www.facebook.com/api/graphql/',
      body,
      {
        headers: {
          Cookie: cookies,
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': userAgent,
          'Origin': 'https://www.facebook.com',
          'Referer': 'https://www.facebook.com/'
        }
      }
    );

    const approvalUrl =
      data?.data?.meta_pay_wallet_init_paypal_linking?.paypal_approval_url ||
      data?.data?.paypal_approval_url ||
      data?.data?.redirect_url;

    if (!approvalUrl) {
      console.error('Facebook Response:', JSON.stringify(data));
      throw new Error('لم يتم العثور على رابط PayPal. تأكد من صحة الكوكيز.');
    }
    return approvalUrl;
  } catch (error) {
    if (error.response) {
        throw new Error(`خطأ من فيسبوك (${error.response.status}): ${JSON.stringify(error.response.data)}`);
    }
    throw new Error('فشل الاتصال بـ Facebook API');
  }
}

// زرع وسيلة الدفع
async function insertFundingSource(cookies, adAccountId, paymentToken, payerId) {
  const payloads = [
    { payment_method_type: 'paypal', paypal_account: { token: paymentToken, payer_id: payerId } },
    { payment_method_type: 'paypal', payment_method_token: { token: paymentToken, payer_id: payerId } }
  ];
  
  const endpoints = [
    `/v18.0/${adAccountId}/funding_sources`,
    `/v18.0/me/funding_sources`
  ];

  for (const endpoint of endpoints) {
    for (const payload of payloads) {
      try {
        const { data } = await axios.post(
          `https://graph.facebook.com${endpoint}`,
          payload,
          {
            headers: {
              Cookie: cookies,
              'Content-Type': 'application/json',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
            }
          }
        );
        return { success: true, data };
      } catch (err) {
        // استمر في المحاولة
      }
    }
  }
  throw new Error('فشلت محاولات الزرع');
}

// ========== API Routes ==========
// 1. استقبال التوكن من المتصفح
app.post('/api/start-linking', async (req, res) => {
  try {
    const { cookies, adAccountId, fbDtsg } = req.body;
    
    if (!cookies || !adAccountId) {
      return res.status(400).json({ error: 'بيانات ناقصة' });
    }
    // إذا لم يتم إرسال التوكن من الواجهة، نرجع خطأ
    if (!fbDtsg) {
      return res.status(400).json({ error: 'لم يتم استلام fb_dtsg من المتصفح' });
    }

    const normalizedAdAccountId = normalizeAdAccountId(adAccountId);
    const userId = getCookieValue(cookies, 'c_user');
    
    if (!userId) throw new Error('الكوكيز غير صالحة (لا يوجد c_user)');

    // استخدام التوكن المستلم مباشرة
    const approvalUrl = await initPayPalLink(cookies, fbDtsg, userId);
    res.json({ approvalUrl });
  } catch (err) {
    console.error('Server Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 2. زرع التوكن
app.post('/api/insert-funding-source', async (req, res) => {
  try {
    const { cookies, adAccountId, paymentToken, payerId } = req.body;
    if (!cookies || !adAccountId || !paymentToken || !payerId) {
      return res.status(400).json({ error: 'بيانات ناقصة' });
    }
    const result = await insertFundingSource(cookies, normalizeAdAccountId(adAccountId), paymentToken, payerId);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
