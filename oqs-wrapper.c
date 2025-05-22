#include <oqs/oqs.h>

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#endif

EMSCRIPTEN_KEEPALIVE
void kyber_generate_keypair(uint8_t *public_key, uint8_t *secret_key) {
    OQS_KEM *kem = OQS_KEM_new(OQS_KEM_alg_kyber_768);
    if (kem != NULL) {
        OQS_KEM_keypair(kem, public_key, secret_key);
        OQS_KEM_free(kem);
    }
}

EMSCRIPTEN_KEEPALIVE
int kyber_encapsulate(uint8_t *ciphertext, uint8_t *shared_secret, const uint8_t *public_key) {
    OQS_KEM *kem = OQS_KEM_new(OQS_KEM_alg_kyber_768);
    if (kem == NULL) return -1;
    int result = OQS_KEM_encaps(kem, ciphertext, shared_secret, public_key);
    OQS_KEM_free(kem);
    return result; // 0 on success, non-zero on failure
}

EMSCRIPTEN_KEEPALIVE
int kyber_decapsulate(uint8_t *shared_secret, const uint8_t *ciphertext, const uint8_t *secret_key) {
    OQS_KEM *kem = OQS_KEM_new(OQS_KEM_alg_kyber_768);
    if (kem == NULL) return -1;
    int result = OQS_KEM_decaps(kem, shared_secret, ciphertext, secret_key);
    OQS_KEM_free(kem);
    return result; // 0 on success, non-zero on failure
}

// Export Kyber768 constants by querying the OQS_KEM object
EMSCRIPTEN_KEEPALIVE
int get_kyber_768_public_key_length() {
    OQS_KEM *kem = OQS_KEM_new(OQS_KEM_alg_kyber_768);
    if (kem != NULL) {
        int length = kem->length_public_key;
        OQS_KEM_free(kem);
        return length;
    }
    return -1; // Error case
}

EMSCRIPTEN_KEEPALIVE
int get_kyber_768_secret_key_length() {
    OQS_KEM *kem = OQS_KEM_new(OQS_KEM_alg_kyber_768);
    if (kem != NULL) {
        int length = kem->length_secret_key;
        OQS_KEM_free(kem);
        return length;
    }
    return -1; // Error case
}

EMSCRIPTEN_KEEPALIVE
int get_kyber_768_shared_secret_length() {
    OQS_KEM *kem = OQS_KEM_new(OQS_KEM_alg_kyber_768);
    if (kem != NULL) {
        int length = kem->length_shared_secret;
        OQS_KEM_free(kem);
        return length;
    }
    return -1; // Error case
}

EMSCRIPTEN_KEEPALIVE
int get_kyber_768_ciphertext_length() {
    OQS_KEM *kem = OQS_KEM_new(OQS_KEM_alg_kyber_768);
    if (kem != NULL) {
        int length = kem->length_ciphertext;
        OQS_KEM_free(kem);
        return length;
    }
    return -1; // Error case
}