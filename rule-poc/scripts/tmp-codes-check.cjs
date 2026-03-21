const Database = require('better-sqlite3');
const db = new Database('c:/work/rule-poc/data/rule-poc.sqlite');
const count = db.prepare('select count(*) as c from stock_master').get().c;
const rows = db.prepare("select code from stock_master where length(code)=4 and code >= '1000' and code <= '9999' limit 3000").all();
console.log('COUNT=' + count);
console.log('CODES=' + rows.length);
console.log('SAMPLE=' + rows.slice(0, 20).map(r => r.code).join(','));
