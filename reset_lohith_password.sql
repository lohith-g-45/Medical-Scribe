UPDATE users
SET password = '$2a$10$kmKbxqhsUps9TfSx2UaTEe4tf3oLwiSJ6SRag9nkaVq7JzEG3BQky'
WHERE id = 3;

SELECT id, name, email, LENGTH(password) AS pwd_len
FROM users
WHERE id = 3;
