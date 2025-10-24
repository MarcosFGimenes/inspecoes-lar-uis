# Inspeções LAR UIS

## Variáveis de ambiente relevantes

Configure as credenciais do Cloudflare R2 antes de executar a aplicação:

- `R2_ACCESS_KEY_ID`: chave de acesso utilizada para assinar as requisições S3.
- `R2_SECRET_ACCESS_KEY`: segredo correspondente à chave acima.
- `R2_BUCKET_NAME`: bucket do R2 onde os arquivos serão gravados.
- `R2_ENDPOINT`: endpoint S3 do R2 (ex.: `https://<account-id>.r2.cloudflarestorage.com`).
- `R2_PUBLIC_BASE_URL`: URL pública usada para servir as imagens (pode conter `{bucket}` como placeholder). Caso não seja informada, o endpoint do R2 é utilizado como base.
- `R2_REGION` (opcional): região utilizada na assinatura (`auto` por padrão).
- `R2_PREFIX` (opcional): prefixo de diretório para organizar os uploads dentro do bucket.

As imagens das inspeções são enviadas diretamente para o R2 utilizando assinatura AWS Signature v4. O retorno do upload inclui o caminho público e metadados mínimos para que o PCM visualize arquivos de qualquer provedor suportado no futuro.
