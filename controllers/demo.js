await createNotification({
      userId:  req.user._id,
      type:    "PAYMENT_RECEIVED",
      title:   "Wallet Topped Up",
      message: `₹${Number(amount).toLocaleString("en-IN")} has been added to your wallet. New balance: ₹${user.client.walletBalance.toLocaleString("en-IN")}.`,
    });