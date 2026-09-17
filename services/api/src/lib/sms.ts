// SMS OTP sender via Fast2SMS (free Indian SMS service)
// Sign up at fast2sms.com → Dashboard → Dev API → copy API key
// Add to .env: FAST2SMS_API_KEY=your_key_here

export async function sendOtp(phone: string, code: string): Promise<boolean> {
  const apiKey = process.env.FAST2SMS_API_KEY

  // No API key configured → dev mode (show in console only)
  if (!apiKey) {
    console.log(`\n📱 [DEV MODE] OTP for ${phone}: ${code}\n`)
    console.log(`   To send real SMS: get API key from fast2sms.com and add FAST2SMS_API_KEY to .env\n`)
    return false // signals dev mode
  }

  // Strip country code if present
  const cleanPhone = phone.replace(/^\+91/, '').replace(/\D/g, '').slice(-10)

  try {
    const url = new URL('https://www.fast2sms.com/dev/bulkV2')
    url.searchParams.set('authorization',     apiKey)
    url.searchParams.set('variables_values',  code)
    url.searchParams.set('route',             'otp')
    url.searchParams.set('numbers',           cleanPhone)

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'cache-control': 'no-cache' },
      signal: AbortSignal.timeout(8000),
    })

    const data = await res.json() as { message: boolean | string }

    if (data.message === true) {
      console.log(`📱 OTP SMS sent to ${cleanPhone} via Fast2SMS ✓`)
      return true
    } else {
      console.error(`📱 Fast2SMS error:`, data.message)
      console.log(`📱 [FALLBACK] OTP for ${phone}: ${code}`)
      return false
    }
  } catch (err) {
    console.error('📱 SMS send failed:', err)
    console.log(`📱 [FALLBACK] OTP for ${phone}: ${code}`)
    return false
  }
}