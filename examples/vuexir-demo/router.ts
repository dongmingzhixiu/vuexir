// Vuexir 组件库演示样例：组织参考 Vant 官网分类（开发指南/基础/表单/反馈/展示/导航/业务/组合式 API）
// 8 个分类均为底部 tab；每 tab 为该分类组件索引，点击 push 组件 demo 页
import GuideView from './pages/Guide.vue'
import BaseView from './pages/Base.vue'
import FormView from './pages/Form.vue'
import FeedbackView from './pages/Feedback.vue'
import DisplayView from './pages/Display.vue'
import NavView from './pages/Nav.vue'
import BizView from './pages/Biz.vue'
import ApiView from './pages/Api.vue'
import Placeholder from './pages/comp/Placeholder.vue'
// 基础组件详情示例（第一批 10 个）
import ButtonView from './pages/comp/Button.vue'
import CellView from './pages/comp/Cell.vue'
import ConfigProviderView from './pages/comp/ConfigProvider.vue'
import IconView from './pages/comp/Icon.vue'
import ImageView from './pages/comp/Image.vue'
import LayoutView from './pages/comp/Layout.vue'
import PopupView from './pages/comp/Popup.vue'
import SpaceView from './pages/comp/Space.vue'
import StyleView from './pages/comp/Style.vue'
import ToastView from './pages/comp/Toast.vue'

const routes = [
  { path: '/guide', name: 'guide', component: GuideView, meta: { title: '开发指南', tab: true, icon: 'book.fill' } },
  { path: '/base', name: 'base', component: BaseView, meta: { title: '基础组件', tab: true, icon: 'square.grid.2x2.fill' } },
  { path: '/form', name: 'form', component: FormView, meta: { title: '表单组件', tab: true, icon: 'textformat.abc' } },
  { path: '/feedback', name: 'feedback', component: FeedbackView, meta: { title: '反馈组件', tab: true, icon: 'bell.fill' } },
  { path: '/display', name: 'display', component: DisplayView, meta: { title: '展示组件', tab: true, icon: 'photo.fill' } },
  { path: '/nav', name: 'nav', component: NavView, meta: { title: '导航组件', tab: true, icon: 'arrow.triangle.branch' } },
  { path: '/biz', name: 'biz', component: BizView, meta: { title: '业务组件', tab: true, icon: 'bag.fill' } },
  { path: '/api', name: 'api', component: ApiView, meta: { title: '组合式 API', tab: true, icon: 'gearshape.fill' } },
  // —— 基础组件 10 ——
  { path: '/comp/button', name: 'button', component: ButtonView, meta: { title: 'Button' } },
  { path: '/comp/cell', name: 'cell', component: CellView, meta: { title: 'Cell' } },
  { path: '/comp/config-provider', name: 'config-provider', component: ConfigProviderView, meta: { title: 'ConfigProvider' } },
  { path: '/comp/icon', name: 'icon', component: IconView, meta: { title: 'Icon' } },
  { path: '/comp/image', name: 'image', component: ImageView, meta: { title: 'Image' } },
  { path: '/comp/layout', name: 'layout', component: LayoutView, meta: { title: 'Layout' } },
  { path: '/comp/popup', name: 'popup', component: PopupView, meta: { title: 'Popup' } },
  { path: '/comp/space', name: 'space', component: SpaceView, meta: { title: 'Space' } },
  { path: '/comp/style', name: 'style', component: StyleView, meta: { title: 'Style' } },
  { path: '/comp/toast', name: 'toast', component: ToastView, meta: { title: 'Toast' } },
  // —— 表单组件 19 ——
  { path: '/comp/calendar', name: 'calendar', component: Placeholder, meta: { title: 'Calendar' } },
  { path: '/comp/cascader', name: 'cascader', component: Placeholder, meta: { title: 'Cascader' } },
  { path: '/comp/checkbox', name: 'checkbox', component: Placeholder, meta: { title: 'Checkbox' } },
  { path: '/comp/date-picker', name: 'date-picker', component: Placeholder, meta: { title: 'DatePicker' } },
  { path: '/comp/field', name: 'field', component: Placeholder, meta: { title: 'Field' } },
  { path: '/comp/form', name: 'form', component: Placeholder, meta: { title: 'Form' } },
  { path: '/comp/number-keyboard', name: 'number-keyboard', component: Placeholder, meta: { title: 'NumberKeyboard' } },
  { path: '/comp/password-input', name: 'password-input', component: Placeholder, meta: { title: 'PasswordInput' } },
  { path: '/comp/picker', name: 'picker', component: Placeholder, meta: { title: 'Picker' } },
  { path: '/comp/picker-group', name: 'picker-group', component: Placeholder, meta: { title: 'PickerGroup' } },
  { path: '/comp/radio', name: 'radio', component: Placeholder, meta: { title: 'Radio' } },
  { path: '/comp/rate', name: 'rate', component: Placeholder, meta: { title: 'Rate' } },
  { path: '/comp/search', name: 'search', component: Placeholder, meta: { title: 'Search' } },
  { path: '/comp/slider', name: 'slider', component: Placeholder, meta: { title: 'Slider' } },
  { path: '/comp/signature', name: 'signature', component: Placeholder, meta: { title: 'Signature' } },
  { path: '/comp/stepper', name: 'stepper', component: Placeholder, meta: { title: 'Stepper' } },
  { path: '/comp/switch', name: 'switch', component: Placeholder, meta: { title: 'Switch' } },
  { path: '/comp/time-picker', name: 'time-picker', component: Placeholder, meta: { title: 'TimePicker' } },
  { path: '/comp/uploader', name: 'uploader', component: Placeholder, meta: { title: 'Uploader' } },
  // —— 反馈组件 12 ——
  { path: '/comp/action-sheet', name: 'action-sheet', component: Placeholder, meta: { title: 'ActionSheet' } },
  { path: '/comp/barrage', name: 'barrage', component: Placeholder, meta: { title: 'Barrage' } },
  { path: '/comp/dialog', name: 'dialog', component: Placeholder, meta: { title: 'Dialog' } },
  { path: '/comp/dropdown-menu', name: 'dropdown-menu', component: Placeholder, meta: { title: 'DropdownMenu' } },
  { path: '/comp/floating-panel', name: 'floating-panel', component: Placeholder, meta: { title: 'FloatingPanel' } },
  { path: '/comp/floating-bubble', name: 'floating-bubble', component: Placeholder, meta: { title: 'FloatingBubble' } },
  { path: '/comp/loading', name: 'loading', component: Placeholder, meta: { title: 'Loading' } },
  { path: '/comp/notify', name: 'notify', component: Placeholder, meta: { title: 'Notify' } },
  { path: '/comp/overlay', name: 'overlay', component: Placeholder, meta: { title: 'Overlay' } },
  { path: '/comp/pull-refresh', name: 'pull-refresh', component: Placeholder, meta: { title: 'PullRefresh' } },
  { path: '/comp/share-sheet', name: 'share-sheet', component: Placeholder, meta: { title: 'ShareSheet' } },
  { path: '/comp/swipe-cell', name: 'swipe-cell', component: Placeholder, meta: { title: 'SwipeCell' } },
  // —— 展示组件 21 ——
  { path: '/comp/badge', name: 'badge', component: Placeholder, meta: { title: 'Badge' } },
  { path: '/comp/circle', name: 'circle', component: Placeholder, meta: { title: 'Circle' } },
  { path: '/comp/collapse', name: 'collapse', component: Placeholder, meta: { title: 'Collapse' } },
  { path: '/comp/count-down', name: 'count-down', component: Placeholder, meta: { title: 'CountDown' } },
  { path: '/comp/divider', name: 'divider', component: Placeholder, meta: { title: 'Divider' } },
  { path: '/comp/empty', name: 'empty', component: Placeholder, meta: { title: 'Empty' } },
  { path: '/comp/highlight', name: 'highlight', component: Placeholder, meta: { title: 'Highlight' } },
  { path: '/comp/image-preview', name: 'image-preview', component: Placeholder, meta: { title: 'ImagePreview' } },
  { path: '/comp/lazyload', name: 'lazyload', component: Placeholder, meta: { title: 'Lazyload' } },
  { path: '/comp/list', name: 'list', component: Placeholder, meta: { title: 'List' } },
  { path: '/comp/notice-bar', name: 'notice-bar', component: Placeholder, meta: { title: 'NoticeBar' } },
  { path: '/comp/popover', name: 'popover', component: Placeholder, meta: { title: 'Popover' } },
  { path: '/comp/progress', name: 'progress', component: Placeholder, meta: { title: 'Progress' } },
  { path: '/comp/rolling-text', name: 'rolling-text', component: Placeholder, meta: { title: 'RollingText' } },
  { path: '/comp/skeleton', name: 'skeleton', component: Placeholder, meta: { title: 'Skeleton' } },
  { path: '/comp/steps', name: 'steps', component: Placeholder, meta: { title: 'Steps' } },
  { path: '/comp/sticky', name: 'sticky', component: Placeholder, meta: { title: 'Sticky' } },
  { path: '/comp/swipe', name: 'swipe', component: Placeholder, meta: { title: 'Swipe' } },
  { path: '/comp/tag', name: 'tag', component: Placeholder, meta: { title: 'Tag' } },
  { path: '/comp/text-ellipsis', name: 'text-ellipsis', component: Placeholder, meta: { title: 'TextEllipsis' } },
  { path: '/comp/watermark', name: 'watermark', component: Placeholder, meta: { title: 'Watermark' } },
  // —— 导航组件 10 ——
  { path: '/comp/action-bar', name: 'action-bar', component: Placeholder, meta: { title: 'ActionBar' } },
  { path: '/comp/back-top', name: 'back-top', component: Placeholder, meta: { title: 'BackTop' } },
  { path: '/comp/grid', name: 'grid', component: Placeholder, meta: { title: 'Grid' } },
  { path: '/comp/index-bar', name: 'index-bar', component: Placeholder, meta: { title: 'IndexBar' } },
  { path: '/comp/nav-bar', name: 'nav-bar', component: Placeholder, meta: { title: 'NavBar' } },
  { path: '/comp/pagination', name: 'pagination', component: Placeholder, meta: { title: 'Pagination' } },
  { path: '/comp/sidebar', name: 'sidebar', component: Placeholder, meta: { title: 'Sidebar' } },
  { path: '/comp/tab', name: 'tab', component: Placeholder, meta: { title: 'Tab' } },
  { path: '/comp/tabbar', name: 'tabbar', component: Placeholder, meta: { title: 'Tabbar' } },
  { path: '/comp/tree-select', name: 'tree-select', component: Placeholder, meta: { title: 'TreeSelect' } },
  // —— 业务组件 9 ——
  { path: '/comp/address-edit', name: 'address-edit', component: Placeholder, meta: { title: 'AddressEdit' } },
  { path: '/comp/address-list', name: 'address-list', component: Placeholder, meta: { title: 'AddressList' } },
  { path: '/comp/area', name: 'area', component: Placeholder, meta: { title: 'Area' } },
  { path: '/comp/card', name: 'card', component: Placeholder, meta: { title: 'Card' } },
  { path: '/comp/contact-card', name: 'contact-card', component: Placeholder, meta: { title: 'ContactCard' } },
  { path: '/comp/contact-edit', name: 'contact-edit', component: Placeholder, meta: { title: 'ContactEdit' } },
  { path: '/comp/contact-list', name: 'contact-list', component: Placeholder, meta: { title: 'ContactList' } },
  { path: '/comp/coupon', name: 'coupon', component: Placeholder, meta: { title: 'Coupon' } },
  { path: '/comp/submit-bar', name: 'submit-bar', component: Placeholder, meta: { title: 'SubmitBar' } },
]

// vue-router 浏览器入口导出（编译器解析仅取 import 表 + routes 数组，本行不影响）
export { routes }
