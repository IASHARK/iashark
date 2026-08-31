const test=require('node:test'),assert=require('node:assert/strict'),d=require('../lib/tools-domain');
test('le calculateur refuse les entrées invalides',()=>assert.equal(d.calculateStake({bankroll:0,odds:2,probability:60}),null));
test('Kelly fractionné est plafonné à 5% de bankroll',()=>{const r=d.calculateStake({bankroll:1000,odds:4,probability:80,fraction:1});assert.equal(r.stake,50);assert.equal(r.bankrollPct,5)});
test('sans edge la mise recommandée vaut zéro',()=>{const r=d.calculateStake({bankroll:1000,odds:2,probability:40});assert.equal(r.stake,0);assert.equal(r.hasEdge,false)});
test('le P&L et le résumé utilisent uniquement les décisions réglées',()=>{const rows=[{stake:20,odds:2,status:'won'},{stake:10,odds:3,status:'lost'},{stake:99,odds:2,status:'pending'}];assert.equal(d.pnl(rows[0]),20);assert.deepEqual(d.summarize(1000,rows),{bankroll:1000,profit:10,roi:33.33,winRate:50,settled:2,total:3})});
