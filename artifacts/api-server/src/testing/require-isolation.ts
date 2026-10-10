const schema=process.env.CLARIX_TEST_SCHEMA;
if(!/^clarix_test_[a-f0-9]+$/.test(schema??"")||
 !process.env.PGOPTIONS?.includes(`role=${schema}`)||
 !process.env.PGOPTIONS?.includes(`search_path=${schema}`)||
 process.env.NODE_ENV==="production"||process.env.REPLIT_DEPLOYMENT==="1")
 throw new Error("Refusing nonisolated tests. Run pnpm test or the test-isolated.ts runner.");
