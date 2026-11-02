import { expect, test, type Page } from '@playwright/test'
import { fakeTmdb } from './fake-tmdb'

const focused = (page: Page) => page.locator('[data-testid="card"].is-focused')
const openDetail = async (page: Page) => {
  await page.keyboard.press('Enter')
  await expect(page.locator('.btn.is-focused')).toHaveText(/Play trailer/) // wait for the detail page to load
}
const press = async (page: Page, key: string, times = 1) => {
  for (let i = 0; i < times; i++) await page.keyboard.press(key)
}

test.beforeEach(async ({ page }) => {
  await fakeTmdb(page)
  await page.goto('/')
  await expect(focused(page)).toHaveCount(1)
})

test('arrow keys move through rows, and rows remember their position', async ({ page }) => {
  const first = await focused(page).getAttribute('aria-label')
  await press(page, 'ArrowRight', 3)
  const fourth = await focused(page).getAttribute('aria-label')
  expect(fourth).not.toBe(first)
  // The hero previews the focused card
  await expect(page.locator('.hero h1')).toHaveCount(1) // old banners fade out first
  await expect(page.locator('.hero h1')).toHaveText(fourth!.split(',')[0])

  await press(page, 'ArrowDown')
  const rowTwo = focused(page).locator('xpath=ancestor::section')
  await expect(rowTwo.locator('h2')).toHaveText(/Because you liked Your Name/)

  await press(page, 'ArrowUp')
  await expect(focused(page)).toHaveAttribute('aria-label', fourth!)
})

test('Enter opens the detail page, Escape returns focus to the same card', async ({ page }) => {
  await press(page, 'ArrowDown')
  await press(page, 'ArrowRight', 2)
  const card = await focused(page).getAttribute('aria-label')

  await press(page, 'Enter')
  const detail = page.getByTestId('detail')
  await expect(detail.locator('h1')).toBeVisible()
  await expect(detail.getByText('1h 41m')).toBeVisible()
  await expect(detail.getByAltText('Max')).toBeVisible()
  await expect(detail.locator('.btn.is-focused')).toHaveText(/Play trailer/)

  await press(page, 'Escape')
  await expect(detail).toHaveCount(0)
  await expect(focused(page)).toHaveAttribute('aria-label', card!)
})

test('My list: add from the detail page, it shows as the first row and survives a reload', async ({ page }) => {
  await openDetail(page)
  await press(page, 'ArrowRight')
  await expect(page.locator('.btn.is-focused')).toHaveText('+ My list')
  await press(page, 'Enter')
  await expect(page.locator('.btn.is-focused')).toHaveText('✓ In My list')
  await press(page, 'Backspace')

  await expect(page.locator('[data-testid="row"] h2').first()).toHaveText('My list')
  await page.reload()
  await expect(page.locator('[data-testid="row"] h2').first()).toHaveText('My list')
})

test('trailer opens over the detail page and Escape closes only the trailer', async ({ page }) => {
  await openDetail(page)
  await press(page, 'Enter')
  await expect(page.locator('.trailer iframe')).toHaveAttribute('src', /youtube-nocookie\.com\/embed\/abc123/)
  await press(page, 'Escape')
  await expect(page.locator('.trailer')).toHaveCount(0)
  await expect(page.getByTestId('detail')).toBeVisible()
  await expect(page.locator('.btn.is-focused')).toHaveText(/Play trailer/)
})
