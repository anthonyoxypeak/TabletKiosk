const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
test('release notes, server, tablet version and offline cache ship as one release',()=>{
 const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
 const release=JSON.parse(read('release.json')),pkg=JSON.parse(read('package.json')),lock=JSON.parse(read('package-lock.json'));
 assert.equal(release.version,pkg.version);assert.equal(lock.version,pkg.version);assert.equal(lock.packages[''].version,pkg.version);assert.ok(release.changes.length>0);
 assert.ok(read('tablet-experience.js').includes("const VERSION = '"+pkg.version+"'"));
 assert.ok(read('seat.html').includes('tablet-experience.js?v='+pkg.version));
 assert.ok(read('offline-worker.js').includes('oxypeak-games-'+pkg.version));
});
