// Builds and deploys Tonightly to AWS: node scripts/deploy.mjs
// Needs the AWS CLI with profile "tonightly" (or AWS_PROFILE) and TMDB_READ_TOKEN in .env.local.
// Optional in .env.local: DOMAIN_NAME + CERTIFICATE_ARN (us-east-1) for the custom domain, KILL_SWITCH=1.
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs'

const STACK = 'tonightly'
const REGION = 'us-east-2'
const PROFILE = process.env.AWS_PROFILE || 'tonightly'

const readEnv = () =>
  Object.fromEntries(
    readFileSync('.env.local', 'utf8')
      .split(/\r?\n/)
      .filter((l) => /^[A-Z_]+=/.test(l))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
  )

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: opts.capture ? ['ignore', 'pipe', 'inherit'] : 'inherit', shell: process.platform === 'win32' && cmd === 'npx', encoding: 'utf8' })
const aws = (args, capture = false) => run('aws', [...args, '--profile', PROFILE, '--region', REGION], { capture })

let env = readEnv()
if (!env.TMDB_READ_TOKEN) throw new Error('TMDB_READ_TOKEN missing from .env.local')
if (!env.ORIGIN_SECRET) {
  // Made once and kept in .env.local, so redeploys don't break the CloudFront-to-Lambda link.
  appendFileSync('.env.local', `\nORIGIN_SECRET=${randomBytes(24).toString('hex')}\n`)
  env = readEnv()
}

console.log('1/5 build site and Lambda')
run('npx', ['vite', 'build'])
run('npx', ['vite', 'build', '-c', 'vite.lambda.config.ts'])

console.log('2/5 package (upload Lambda code)')
const account = aws(['sts', 'get-caller-identity', '--query', 'Account', '--output', 'text'], true).trim()
const artifacts = `tonightly-artifacts-${account}-${REGION}`
try {
  aws(['s3api', 'head-bucket', '--bucket', artifacts], true)
} catch {
  aws(['s3', 'mb', `s3://${artifacts}`])
}
mkdirSync('.aws-sam', { recursive: true })
aws(['cloudformation', 'package', '--template-file', 'template.yaml', '--s3-bucket', artifacts, '--output-template-file', '.aws-sam/packaged.yaml'])

console.log('3/5 deploy stack')
const params = [
  `TmdbReadToken=${env.TMDB_READ_TOKEN}`,
  `OriginSecret=${env.ORIGIN_SECRET}`,
  `DomainName=${env.DOMAIN_NAME ?? ''}`,
  `CertificateArn=${env.CERTIFICATE_ARN ?? ''}`,
  `KillSwitch=${env.KILL_SWITCH === '1' ? '1' : '0'}`,
]
aws([
  'cloudformation', 'deploy', '--template-file', '.aws-sam/packaged.yaml', '--stack-name', STACK,
  '--capabilities', 'CAPABILITY_IAM', 'CAPABILITY_AUTO_EXPAND', '--no-fail-on-empty-changeset',
  '--parameter-overrides', ...params,
])

const outputs = JSON.parse(aws(['cloudformation', 'describe-stacks', '--stack-name', STACK, '--query', 'Stacks[0].Outputs', '--output', 'json'], true))
const out = Object.fromEntries(outputs.map((o) => [o.OutputKey, o.OutputValue]))

console.log('4/5 upload site')
// Hashed assets never change, so cache them for a year. index.html is checked on every visit.
aws(['s3', 'sync', 'dist', `s3://${out.BucketName}`, '--delete', '--exclude', 'index.html', '--cache-control', 'public,max-age=31536000,immutable'])
aws(['s3', 'cp', 'dist/index.html', `s3://${out.BucketName}/index.html`, '--cache-control', 'no-cache'])

console.log('5/5 refresh CloudFront')
aws(['cloudfront', 'create-invalidation', '--distribution-id', out.DistributionId, '--paths', '/index.html'], true)

console.log(`\nLive: ${out.SiteUrl}\nCloudFront domain (for the DNS CNAME): ${out.CloudFrontDomain}`)
