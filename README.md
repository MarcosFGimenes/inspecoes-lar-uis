# Inspeções LAR

Este projeto utiliza Next.js para gestão de inspeções de máquinas. Para habilitar os novos uploads de imagens via Cloudflare R2 é necessário configurar as seguintes variáveis de ambiente no `.env.local`:

```
R2_ACCOUNT_ID=<id_da_conta>
R2_ACCESS_KEY_ID=<access_key>
R2_SECRET_ACCESS_KEY=<secret_key>
R2_BUCKET=<nome_do_bucket>
R2_PUBLIC_BASE_URL=<https://dominio-publico-ou-r2.dev/bucket>
R2_REGION=auto
```

O `R2_PUBLIC_BASE_URL` deve apontar para o domínio público configurado para o bucket (por exemplo, um domínio customizado ou a URL `*.r2.dev`).

