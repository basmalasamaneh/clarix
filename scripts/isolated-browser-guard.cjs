const s=process.env.CLARIX_TEST_SCHEMA,url=process.env.CLARIX_TEST_BASE_URL;
if(!/^clarix_test_[a-f0-9]+$/.test(s||"")||!/^http:\/\/127\.0\.0\.1:\d+$/.test(url||"")||new URL(url).port==="80")
 throw new Error("Use the isolated runner: pnpm --filter @workspace/api-server exec tsx src/scripts/test-isolated.ts --browser scripts/<check>.cjs");
module.exports=url;
