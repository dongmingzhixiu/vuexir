// M10 异步能力样例：Promise / async-await / fetch / setTimeout / 动态列表（R72）
import AsyncView from './pages/Async.vue'
import TimerBoxView from './pages/TimerBox.vue'

const routes = [
  { path: '/async', name: 'async', component: AsyncView, meta: { title: '异步能力', tab: true, icon: 'book.fill' } },
  { path: '/timer', name: 'timer', component: TimerBoxView, meta: { title: '定时器', tab: true, icon: 'bell.fill' } },
  { path: '/comp/chain', name: 'chain', component: AsyncView, meta: { title: 'Promise 链' } },
]

export default routes
