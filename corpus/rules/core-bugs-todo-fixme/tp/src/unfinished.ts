// True-positive fixture for core-bugs-todo-fixme.
// Four comment leaders. All four MUST fire (one finding each).

export function step1(): void {
  // TODO: validate input before proceeding
}

export function step2(): void {
  // FIXME(alice): off-by-one when n === 0
}

export function step3(): void {
  // XXX: depends on undocumented behaviour of crypto.subtle on Safari
}

export function step4(): void {
  // HACK: comment out for the demo, remove before prod
}
