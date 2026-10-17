// 多页路由：meta.tab=true → 底部 tab；其余为 push 二级页
import HomeView from './pages/Home.vue'
import AboutView from './pages/About.vue'

const routes = [
  { path: '/', name: 'home', component: HomeView, meta: { title: '首页', tab: true, icon: 'home.fill' } },
  { path: '/me', name: 'me', component: AboutView, meta: { title: '我的', tab: true, icon: 'person.fill' } },
  { path: '/detail', name: 'detail', component: AboutView, meta: { title: '详情' } },
]

export default routes
