import test from 'node:test';
import assert from 'node:assert/strict';
import { initialBoard, boardDistance, boardMove, stanceMultiplier } from '../src/turn-rules.generated.js';

test('다섯 칸 전투장에서 양쪽 이동과 충돌이 일치한다', () => {
  const board = initialBoard(4);
  assert.deepEqual(board, { p: 1, e: 5 });
  assert.equal(boardMove(board, 'p', 'e', { move: -2 }), 2);
  assert.deepEqual(board, { p: 3, e: 5 });
  assert.equal(boardMove(board, 'e', 'p', { move: -2 }), 0);
  assert.deepEqual(board, { p: 3, e: 3 });
  assert.equal(boardMove(board, 'p', 'e', { move: 2 }), 2);
  assert.deepEqual(board, { p: 1, e: 3 });
  assert.equal(boardDistance(board), 2);
});

test('상단과 하단 공격은 반대 자세에 강하고 같은 자세에 약하다', () => {
  assert.equal(stanceMultiplier('high', 'low'), 1.5);
  assert.equal(stanceMultiplier('low', 'high'), 1.5);
  assert.equal(stanceMultiplier('high', 'high'), .75);
  assert.equal(stanceMultiplier('low', 'low'), .75);
  assert.equal(stanceMultiplier('high', 'mid'), 1);
});

