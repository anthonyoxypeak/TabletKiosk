const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../games-core');
function random(seed){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
test('every Lights Out difficulty starts unsolved and the tracked hint plan always solves it',()=>{
 for(const size of [3,4,5])for(let seed=0;seed<80;seed++){
  const {cells,solution}=C.lightsPuzzle(size,random(seed)),plan=new Set(solution);
  assert.ok(cells.some(Boolean));assert.equal(plan.size,solution.length);
  // Arbitrary guest moves must leave the hint plan valid, including repeated taps.
  for(const tap of [0,size-1,size*size-1,0]){for(const i of C.crossCells(tap,size))cells[i]=!cells[i];plan.has(tap)?plan.delete(tap):plan.add(tap);}
  for(const tap of plan)for(const i of C.crossCells(tap,size))cells[i]=!cells[i];
  assert.ok(cells.every(v=>!v));
 }
 assert.deepEqual(C.crossCells(3,4),[3,7,2]); // Never wrap to the next row.
});
test('word search words remain readable, in bounds, and selectable forward or backward at every difficulty',()=>{
 const words=['OXYGEN','BRAIN','FOCUS','THERAPY','HEALTH','LIFE'];
 for(const size of [7,9,11])for(let seed=0;seed<60;seed++){
  const puzzle=C.wordSearch(words,size,size>7,random(seed));assert.equal(puzzle.cells.length,size*size);assert.ok(puzzle.words.length>=4);
  for(const {word,path} of puzzle.words){assert.ok(path.every(i=>i>=0&&i<size*size));assert.equal(path.map(i=>puzzle.cells[i]).join(''),word);assert.deepEqual(C.lineCells(path[0],path.at(-1),size),path);assert.deepEqual(C.lineCells(path.at(-1),path[0],size),[...path].reverse());}
 }
 assert.deepEqual(C.lineCells(0,11,7),[]); // Reject bent selections.
});
