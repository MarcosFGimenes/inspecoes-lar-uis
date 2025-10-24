# Inspeções LAR UIS

## Variáveis de ambiente relevantes

Configure as chaves de upload de imagens antes de executar a aplicação:

- `IMGBB_API_KEYS`: lista separada por vírgulas com as chaves do ImgBB usadas em rotação (round-robin).
- `IMGBB_API_KEY`: chave única do ImgBB utilizada como fallback caso `IMGBB_API_KEYS` não seja definida.
- `POSTIMAGES_API_KEY`: chave da API do Postimages para o fallback automático quando todas as chaves do ImgBB falharem.
- `POSTIMAGES_GALLERY`: identificador opcional da galeria no Postimages.

A rotina de upload tenta enviar a imagem para o ImgBB, trocando de chave automaticamente a cada requisição e realizando uma segunda tentativa com a próxima chave disponível em caso de erro (por exemplo, limite de requisições). Se todas as chaves falharem, o serviço faz o fallback para o Postimages utilizando `POSTIMAGES_API_KEY`.

Certifique-se de definir pelo menos uma chave do ImgBB e a chave do Postimages em ambientes de produção para evitar falhas de upload.
