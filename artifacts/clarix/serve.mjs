import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('./dist/public/',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.woff':'font/woff','.woff2':'font/woff2','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.jpg':'image/jpeg'};
createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Strict-Transport-Security','max-age=31536000; includeSubDomains');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self' https://storage.googleapis.com; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'");
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    let path=resolve(root,'.'+pathname);
    if(!path.startsWith(resolve(root)+sep)&&path!==resolve(root)){res.writeHead(404);res.end();return;}
    try{if(!(await stat(path)).isFile())path=resolve(root,'index.html');}
    catch{if(extname(path)){res.writeHead(404);res.end();return;}path=resolve(root,'index.html');}
    const bytes=await readFile(path);
    res.setHeader('Content-Type',types[extname(path)]??'application/octet-stream');
    res.setHeader('Cache-Control',extname(path)==='.html'?'no-store':'public, max-age=3600');
    res.end(req.method==='HEAD'?undefined:bytes);
  }catch{res.writeHead(500);res.end('Unable to load this page. Please retry. / تعذر تحميل الصفحة. حاول مجدداً.');}
}).listen(Number(process.env.PORT),'0.0.0.0');
