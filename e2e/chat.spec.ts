import { expect, test, type Page } from '@playwright/test'
import { fakeTmdb } from './fake-tmdb'

const pick = (id: number, name: string) => ({ id, type: 'movie', name, year: '2010', rating: 7.1, overview: 'Fake.', poster: '/p.png', backdrop: '/b.png' })

// A fake assistant: answers with two picks, and opens one when asked to "open".
async function fakeChat(page: Page) {
  const sent: string[] = []
  await page.route('**/api/chat', async (route) => {
    const { message } = route.request().postDataJSON() as { message: string }
    sent.push(message)
    const picks = [pick(11, 'Space Ride'), pick(12, 'Moon Laughs')]
    const open = message.includes('open') ? picks[1] : null
    await route.fulfill({ json: { ok: true, data: { reply: 'Here are two funny space movies.', picks, open } } })
  })
  return sent
}

const focused = (page: Page) => page.locator('.is-focused')

test.beforeEach(async ({ page }) => {
  await fakeTmdb(page)
  await page.goto('/')
  await expect(page.locator('[data-testid="card"].is-focused')).toHaveCount(1)
})

test('"/" opens the chat, typing works with the remote, picks become the For tonight row', async ({ page }) => {
  const sent = await fakeChat(page)
  await page.keyboard.press('/')
  const input = page.getByRole('textbox', { name: 'Ask for something to watch' })
  await expect(input).toBeFocused()

  // Left arrow and Backspace edit the text instead of moving focus or closing anything
  await page.keyboard.type('funny spacr')
  await page.keyboard.press('Backspace')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.type('e movie')
  await expect(input).toHaveValue('funny space movie')
  await page.keyboard.press('Enter')

  await expect(page.getByTestId('chat')).toContainText('Here are two funny space movies.')
  expect(sent).toEqual(['funny space movie'])
  await expect(page.getByTestId('chat').getByTestId('card')).toHaveCount(2)

  // Escape closes the chat and lands on the new row
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('chat')).toHaveCount(0)
  const row = focused(page).locator('xpath=ancestor::section')
  await expect(row.locator('h2')).toHaveText('For tonight')
  await expect(focused(page)).toHaveAttribute('aria-label', /Space Ride/)
})

test('the assistant can open a title, and Back returns to it in the For tonight row', async ({ page }) => {
  await fakeChat(page)
  await page.getByRole('button', { name: /Ask Tonightly/ }).click()
  await page.keyboard.type('open the second one')
  await page.keyboard.press('Enter')

  await expect(page.getByTestId('detail')).toBeVisible()
  await expect(page.locator('.btn.is-focused')).toHaveText(/Play trailer/)
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('detail')).toHaveCount(0)
  await expect(focused(page)).toHaveAttribute('aria-label', /Moon Laughs/)
})

test('a pick in the chat opens with Enter, and Back returns to the chat', async ({ page }) => {
  await fakeChat(page)
  await page.keyboard.press('/')
  await page.keyboard.type('space')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('chat').getByTestId('card')).toHaveCount(2)

  await page.keyboard.press('ArrowUp') // from the text box up to the newest picks
  await expect(focused(page)).toHaveAttribute('aria-label', /Space Ride|Moon Laughs/)
  const label = await focused(page).getAttribute('aria-label')
  await page.keyboard.press('Enter')
  await expect(page.locator('.btn.is-focused')).toHaveText(/Play trailer/)
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('chat')).toBeVisible()
  await expect(focused(page)).toHaveAttribute('aria-label', label!)
})

test('shows the server error and keeps the chat usable', async ({ page }) => {
  await page.route('**/api/chat', (r) => r.fulfill({ status: 429, json: { ok: false, error: 'This chat is full. Reload the page to start a new one.' } }))
  await page.keyboard.press('/')
  await page.keyboard.type('hi')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('chat')).toContainText('This chat is full')
  await expect(page.getByRole('textbox', { name: 'Ask for something to watch' })).toBeFocused()
})

test('Voice on reads the reply aloud, Voice off does not', async ({ page }) => {
  // Record what the page asks the browser to say instead of playing audio.
  await page.addInitScript(() => {
    const spoken: string[] = []
    Object.assign(window, { spoken })
    speechSynthesis.speak = (u: SpeechSynthesisUtterance) => void spoken.push(u.text)
  })
  await page.reload()
  await expect(page.locator('[data-testid="card"].is-focused')).toHaveCount(1)
  await fakeChat(page)
  await page.keyboard.press('/')
  const toggle = page.getByRole('button', { name: /Read aloud/ })
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')

  await page.keyboard.type('quiet please')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('chat')).toContainText('Here are two')
  await toggle.click()
  await expect(toggle).toHaveText('Read aloud: on')
  await page.getByRole('textbox', { name: 'Ask for something to watch' }).fill('talk to me')
  await page.getByRole('textbox', { name: 'Ask for something to watch' }).press('Enter')
  await expect(page.locator('.msg-assistant')).toHaveCount(2)
  expect(await page.evaluate(() => (window as unknown as { spoken: string[] }).spoken)).toEqual(['Here are two funny space movies.'])
})
