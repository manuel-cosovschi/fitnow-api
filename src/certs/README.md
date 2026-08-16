# Certificados fijados

## AppleRootCA-G3.pem

Certificado raíz **Apple Root CA - G3**, descargado de
<https://www.apple.com/certificateauthority/AppleRootCA-G3.cer> y convertido a PEM.

Es el ancla de confianza con la que se validan los comprobantes de compra de
StoreKit 2 y las App Store Server Notifications: Apple los firma con una cadena
de certificados que termina en esta raíz, así que fijarla es lo que permite
distinguir un comprobante real de uno inventado.

```
subject      CN=Apple Root CA - G3, OU=Apple Certification Authority, O=Apple Inc., C=US
vigencia     2014-04-30 → 2039-04-30
clave        EC P-384
SHA-256      63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79
```

**Es público, no es un secreto.** Un certificado raíz contiene solo la clave
pública; va versionado a propósito para que el backend valide compras apenas se
despliega, sin ningún paso de configuración que alguien pueda olvidarse. La
clave privada la tiene Apple y nadie más.

Vence en 2039. Se puede sobreescribir con la variable `APPLE_ROOT_CA_G3` sin
tocar código, por si Apple rota la raíz antes de esa fecha.

Para comprobar que el archivo es el que dice ser:

```bash
openssl x509 -in src/certs/AppleRootCA-G3.pem -noout -subject -dates -fingerprint -sha256
```
