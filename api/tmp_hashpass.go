package main

import (
  "fmt"
  "github.com/lcdpc/lcdpc-go/internal/auth"
)

func main() {
  h, err := auth.HashPassword("SuperPerro123!")
  if err != nil {
    panic(err)
  }
  fmt.Println(h)
}
