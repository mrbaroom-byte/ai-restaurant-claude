# Test fixtures

`stamp-key.pem` and `stamp-cert.pem` are a throwaway secp256k1 key pair and a self-signed
certificate, generated with OpenSSL purely so the ZATCA signing tests have something to sign
with. They are **not** ZATCA-issued and are not usable against any ZATCA environment.

Regenerate with:

```sh
openssl ecparam -name secp256k1 -genkey -noout -out ec.pem
openssl pkcs8 -topk8 -nocrypt -in ec.pem -out stamp-key.pem
openssl req -new -x509 -key stamp-key.pem -sha256 -days 3650 -out stamp-cert.pem \
  -subj "/C=SA/O=ZATCA Test CA/OU=Compliance/CN=TSTZATCA-Code-Signing"
rm ec.pem
```
