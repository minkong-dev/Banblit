// 드롭다운의 선택지 이동 규칙입니다. 화면이나 서버와 상호작용하지 않습니다.
// 어느 선택지로 이동할지만 계산하고, 열고 닫는 것과 그리는 것은 components/Dropdown.tsx 가 담당합니다.

/** 드롭다운 선택지 하나입니다. value 는 화면이 서버에 넘기는 값이고 label 은 사람이 읽는 문구입니다.
 *  disabled 인 선택지는 목록에 표시하되 고를 수 없습니다(이미 찬 시각 등). */
export type Choice<T> = { value: T; label: string; disabled?: boolean };

/** from 에서 step 칸만큼 이동한 뒤, 고를 수 없는 선택지를 건너뛴 위치를 반환합니다.
 *  step 은 아래로 이동할 때 1, 위로 이동할 때 -1 입니다. 양 끝에서는 더 이동하지 않고 현재 위치를 유지합니다.
 *  현재 위치도 고를 수 없으면 -1 을 반환합니다. */
export function moveChoice<T>(choices: Choice<T>[], from: number, step: number): number {
  for (let at = from + step; at >= 0 && at < choices.length; at += step) {
    if (choices[at].disabled !== true) return at;
  }
  const staying = from >= 0 && from < choices.length && choices[from].disabled !== true;
  return staying ? from : -1;
}

/** 목록의 처음(step 이 1) 또는 끝(step 이 -1)에서 시작해 처음으로 고를 수 있는 선택지의 위치입니다.
 *  Home·End 키가 사용합니다. 고를 수 있는 선택지가 없으면 -1 입니다. */
export function edgeChoice<T>(choices: Choice<T>[], step: number): number {
  return moveChoice(choices, step > 0 ? -1 : choices.length, step);
}

/** 목록을 열 때 커서를 둘 위치입니다. 지금 고른 값을 고를 수 있으면 그 자리, 아니면 첫 번째입니다. */
export function openAt<T>(choices: Choice<T>[], value: T): number {
  const at = choices.findIndex((choice) => choice.value === value);
  return at >= 0 && choices[at].disabled !== true ? at : edgeChoice(choices, 1);
}
