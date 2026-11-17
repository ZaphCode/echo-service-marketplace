import { describe, expect, test } from "bun:test";

import {
  validEmailRules,
  validConfirmPasswordRules,
  validDateRules,
  validNameRules,
  validPasswordRules,
  validPhoneRules,
  validPriceRules,
  validZipCodeRules,
} from "../src/utils/validations";

describe("validaciones de formularios", () => {
  test("acepta un correo válido y rechaza uno incompleto", () => {
    const pattern = validEmailRules.pattern as { value: RegExp };

    expect(pattern.value.test("persona@ejemplo.com")).toBe(true);
    expect(pattern.value.test("persona@ejemplo")).toBe(false);
  });

  test("valida precios positivos con hasta dos decimales", () => {
    const pattern = validPriceRules.pattern as { value: RegExp };
    const validate = validPriceRules.validate as (value: string) => true | string;

    expect(pattern.value.test("125.50")).toBe(true);
    expect(pattern.value.test("125.555")).toBe(false);
    expect(validate("125")).toBe(true);
    expect(validate("0")).toBe("El precio debe ser mayor a cero");
  });

  test("valida teléfonos con entre 10 y 15 dígitos", () => {
    const pattern = validPhoneRules.pattern as { value: RegExp };
    const validate = validPhoneRules.validate as (value: string) => true | string;

    expect(pattern.value.test("+52 123 456 7890")).toBe(true);
    expect(validate("+52 123 456 7890")).toBe(true);
    expect(validate("12345")).toBe("Debe tener al menos 10 dígitos");
  });

  test("aplica longitud mínima y máxima a la contraseña", () => {
    expect(validPasswordRules.minLength).toEqual({
      value: 8,
      message: "La contraseña debe tener al menos 8 caracteres",
    });
    expect(validPasswordRules.maxLength).toEqual({
      value: 20,
      message: "La contraseña no puede tener más de 20 caracteres",
    });
  });

  test("valida fechas futuras y rechaza fechas inválidas", () => {
    const validate = validDateRules.validate as (value: string) => true | string;

    expect(validate("2099-12-31")).toBe(true);
    expect(validate("fecha-inválida")).toBe("La fecha no es válida");

    // Hoy es válido aunque la hora elegida ya haya pasado.
    const earlierToday = new Date();
    earlierToday.setHours(0, 0, 1, 0);
    expect(validate(earlierToday.toISOString())).toBe(true);

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    expect(validate(yesterday.toISOString())).toBe(
      "La fecha no puede ser anterior a hoy"
    );
  });

  test("valida nombres y códigos postales", () => {
    const namePattern = validNameRules.pattern as { value: RegExp };
    const zipPattern = validZipCodeRules.pattern as { value: RegExp };

    expect(namePattern.value.test("Maria Lopez")).toBe(true);
    expect(namePattern.value.test("María López")).toBe(true);
    expect(namePattern.value.test("José Ángel Muñoz-Agúndez")).toBe(true);
    expect(namePattern.value.test("Usuario123")).toBe(false);
    expect(zipPattern.value.test("80000")).toBe(true);
    expect(zipPattern.value.test("8000")).toBe(false);
  });

  test("confirma que las contraseñas coincidan", () => {
    const validate = validConfirmPasswordRules.validate as (
      value: string,
      formValues: { password: string }
    ) => true | string;

    expect(validate("secreto123", { password: "secreto123" })).toBe(true);
    expect(validate("diferente", { password: "secreto123" })).toBe(
      "Las contraseñas no coinciden"
    );
  });
});
