import { act, type ReactElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { CountryFlag, flagImage } from "./CountryFlag"

// React 的 act 要这个开关才肯工作；没上 testing-library，就自己开。
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

// 旗子的两条渲染路径在这里被钉住：React 那条（卡片/表格/详情页/芯片/表头）与
// Leaflet 浮层那份手工 DOM。二者共用同一个地址与同一份尺寸，改坏任何一处都会红。
//
// 加载失败那条分支是真事件驱动的：dispatch 一个 error 就是浏览器在文件缺失时会
// 发的那一个，所以这里验的不只是「渲染了什么」，还有「挂了以后怎么办」。
let host: HTMLDivElement
let root: Root

beforeEach(() => {
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

/** 渲染一个组件并把它的 HTML 交出来。 */
function render(node: ReactElement) {
  act(() => root.render(node))
  return host.innerHTML
}

/** 让 host 里那张旗子加载失败，走一遍 onError。 */
function failTheImage() {
  const img = host.querySelector("img")
  expect(img, "应当先有一张旗子").not.toBeNull()
  act(() => img!.dispatchEvent(new Event("error")))
}

describe("CountryFlag", () => {
  it("国家码渲染成随包内置的旗子", () => {
    const html = render(<CountryFlag code="US" />)
    expect(html).toContain('src="/flags/us.svg"')
    // 装饰性：芯片、表头、浮层都把国码写在旗子旁边，读屏不必再念一遍
    expect(html).toContain('alt=""')
    expect(html).toContain("h-[1em] w-[1.333em]")
  })

  it("小写码归一", () => {
    expect(render(<CountryFlag code="cn" />)).toContain('src="/flags/cn.svg"')
  })

  it("不是国家码就什么都不渲染", () => {
    expect(render(<CountryFlag code="USA" />)).toBe("")
    expect(render(<CountryFlag code="" />)).toBe("")
  })

  it("图加载失败时退回国家码文字", () => {
    render(<CountryFlag code="AP" />)
    failTheImage()
    expect(host.querySelector("img")).toBeNull()
    expect(host.textContent).toBe("AP")
  })

  it("换了国家码就重新试一次图", () => {
    render(<CountryFlag code="AP" />)
    failTheImage()
    expect(host.textContent).toBe("AP")
    // 记的是「哪个码挂了」而不是一个布尔：换码不能继承上一个码的失败
    render(<CountryFlag code="US" />)
    expect(host.querySelector("img")?.getAttribute("src")).toBe("/flags/us.svg")
  })
})

describe("flagImage", () => {
  it("造出与组件同一份尺寸的 img", () => {
    const img = flagImage("de")!
    expect(img.getAttribute("src")).toBe("/flags/de.svg")
    expect(img.alt).toBe("")
    expect(img.className).toContain("h-[1em]")
    expect(img.className).toContain("align-middle")
  })

  it("不是国家码返回 null", () => {
    expect(flagImage("")).toBeNull()
  })

  it("加载失败就从浮层里撤掉自己", () => {
    const tip = document.createElement("span")
    tip.append(flagImage("US")!, " ")
    expect(tip.querySelector("img")).not.toBeNull()
    // 浮层的文字里本来就印着国码，所以这里不退回文字，直接撤掉
    tip.querySelector("img")!.dispatchEvent(new Event("error"))
    expect(tip.querySelector("img")).toBeNull()
  })
})
