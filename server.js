// server.js
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ========== دوال مساعدة ==========

// استخراج قيمة محددة من كوكيز
function getCookieValue(cookies, name) {
  // تنظيف الكوكيز من المسافات الزائدة إذا وجدت
  const cleanCookies = cookies.replace(/;\s*/g, ';');
  const match = cleanCookies.match(new RegExp(`(?:^|;)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function normalizeAdAccountId(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  return trimmed.startsWith('act_') ? trimmed : `act_${trimmed}`;
}

// استخراج fb_dtsg من HTML الصفحة الرئيسية لفيسبوك
async function extractFbDtsg(cookies) {
  try {
    // تم تصحيح User-Agent وترويسات الطلب لتجنب الحظر
    const { data: html } = await axios.get('https://www.facebook.com/', {
      headers: {
        Cookie: cookies,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      }
    });
    
    // محاولة العثور على fb_dtsg في HTML
    const match = html.match(/name="fb_dtsg" content="([^"]+)"/);
    if (match) return match[1];
    
    // محاولة أخرى من حالة JavaScript الأولية
    const jsMatch = html.match(/["DTSGInitialData",\s*[],\s*{"token":"([^"]+)"}]/);
    if (jsMatch) return jsMatch[1];
    
    throw new Error('لم يتم العثور على fb_dtsg (قد تكون الجلسة منتهية أو الحساب محظور)');
  } catch (err) {
    throw new Error('فشل استخراج fb_dtsg: ' + err.message);
  }
}

// استخراج profile_id الخاص بالدفع
async function extractPaymentProfileId(cookies, userId) {
  try {
    // هذه الدالة تعتمد على هيكلية قد تتغير، لذا نستخدم fallback في الدالة التالية
    return null; 
  } catch {
    return null;
  }
}

// تنفيذ GraphQL لربط PayPal
async function initPayPalLink(cookies, fbDtsg, userId, profileId) {
  const variables = {
    input: {
      mutation_params: {
        close_url: "https://secure.facebook.com/payments/redirect/?instance_id=6fe12dd2-c2e2-4ab0-a842-a01e094fbd9b&target_domain=https%3A%2F%2Faccountscenter.facebook.com&type=rp",
        login_ref_id: "6fe12dd2-c2e2-4ab0-a842-a01e094fbd9b"
      },
      profile_id: profileId || "FXACINFRAOBIDPERVIEWERAVMwhxCKmjhHOsHYDHD2jJttp4MJMP0zcJb-tOnHowAUfL3PcWtQEL4CVskvwI4eC03vgkFlaYWgsVgu8VTFoQzDkQ", // قيمة fallback
      actor_id: userId,
      client_mutation_id: "3"
    }
  };

  const body = new URLSearchParams({
    __a: "1",
    __req: "17",
    // تم تصحيح القيمة هنا (إزالة ... التي تسبب خطأ)
    __hs: "20618.HYP:accounts_center_pkg.2.1..0", 
    dpr: "1",
    __ccg: "EXCELLENT",
    __rev: "1041437765",
    __s: "3zgi2m:uc0vqk:jd0d7n",
    __hsi: "7651186107637418310",
    fb_dtsg: fbDtsg,
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
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          'Referer': 'https://www.facebook.com/',
          'Origin': 'https://www.facebook.com'
        }
      }
    );

    const approvalUrl =
      data?.data?.meta_pay_wallet_init_paypal_linking?.paypal_approval_url ||
      data?.data?.paypal_approval_url ||
      data?.data?.redirect_url;

    if (!approvalUrl) {
      console.error('رد Facebook:', JSON.stringify(data));
      throw new Error('لم يتم العثور على رابط PayPal في رد Facebook (ربما تحتاج لتأكيد الحساب)');
    }

    return approvalUrl;
  } catch (error) {
    throw new Error('فشل الاتصال بـ Facebook API: ' + (error.response?.data?.error?.message || error.message));
  }
}

// زرع وسيلة الدفع في الحساب الإعلاني
async function insertFundingSource(cookies, adAccountId, paymentToken, payerId) {
  const payloads = [
    {
      payment_method_type: 'paypal',
      paypal_account: { token: paymentToken, payer_id: payerId }
    },
    {
      payment_method_type: 'paypal',
      payment_method_token: { token: paymentToken, payer_id: payerId }
    }
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
        // استمر في المحاولة التالية
      }
    }
  }
  throw new Error('فشلت جميع محاولات زرع وسيلة الدفع');
}

// ========== API Routes ==========

app.post('/api/start-linking', async (req, res) => {
  try {
    const { cookies, adAccountId } = req.body;
    if (!cookies || !adAccountId) {
      return res.status(400).json({ error: 'مطلوب cookies و adAccountId' });
    }
    const normalizedAdAccountId = normalizeAdAccountId(adAccountId);

    // استخراج user ID من الكوكيز
    const userId = getCookieValue(cookies, 'c_user');
    if (!userId) throw new Error('لم يتم العثور على c_user في الكوكيز');

    // استخراج fb_dtsg تلقائياً
    const fbDtsg = await extractFbDtsg(cookies);
    // محاولة استخراج profile_id
    const profileId = await extractPaymentProfileId(cookies, userId);

    // بدء ربط PayPal
    const approvalUrl = await initPayPalLink(cookies, fbDtsg, userId, profileId, normalizedAdAccountId);
    res.json({ approvalUrl });
  } catch (err) {
    console.error('Server Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/insert-funding-source', async (req, res) => {
  try {
    const { cookies, adAccountId, paymentToken, payerId } = req.body;
    if (!cookies || !adAccountId || !paymentToken || !payerId) {
      return res.status(400).json({ error: 'بيانات ناقصة' });
    }
    const normalizedAdAccountId = normalizeAdAccountId(adAccountId);
    const result = await insertFundingSource(cookies, normalizedAdAccountId, paymentToken, payerId);
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('Server Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
