const test=require('node:test');const assert=require('node:assert/strict');const ui=require('../src/queue/ui.js');
test('queue viewport remains five items with padded row geometry',()=>{assert.equal(ui.MAX_VISIBLE_ITEMS,5);assert.equal(ui.ROW_HEIGHT_PX,38);assert.equal(ui.ROW_GAP_PX,6);assert.equal(ui.queueViewportMaxHeightPx(),214);});
test('undo countdown exposes seconds and shrinking ratio',()=>{assert.deepEqual(ui.undoCountdown({expiresAt:6000,now:1000}),{seconds:5,ratio:1});const c=ui.undoCountdown({expiresAt:6000,now:5001});assert.equal(c.seconds,1);assert.ok(c.ratio>0&&c.ratio<0.2);assert.deepEqual(ui.undoCountdown({expiresAt:6000,now:6000}),{seconds:0,ratio:0});});

test('overflow policy and action icons remain stable', () => {
  assert.equal(ui.hasQueueOverflow(5), false);
  assert.equal(ui.hasQueueOverflow(6), true);
  assert.equal(ui.shouldShowHiddenAboveIndicator(6, 40), true);
  assert.equal(ui.shouldShowHiddenAboveIndicator(6, 0), false);
  for (const name of ['edit','delete','undo','up','grab','steer']) {
    const svg = ui.ICONS[name];
    assert.match(svg, /^<svg\b/);
    assert.doesNotMatch(svg, /SVGRepo_/);
    assert.doesNotMatch(svg, /id=/);
    assert.match(svg, /currentColor/);
  }
});
