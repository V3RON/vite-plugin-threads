import { test } from './test.worker';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div>
    Hello!
  </div>
`

test().then(console.log);
